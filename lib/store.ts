"use client";
// One store. Every read comes from Supabase through the app's own API
// routes (app/api/data); every action (promote, pause, budget, sync) is an
// API route that talks to Meta or Apify server-side. There is no demo:
// without the password on this device the app shows the sign-in screen,
// and with it, whatever has actually synced — empty states included.
import { create } from "zustand";
import registry from "./generated/registry.json";
import { Account, AutoOffEvent, AutoOffRule, Connector, SessionMode, Snapshot, emptySnapshot } from "./types";
import { DEMO } from "./demo";

const TOKEN_KEY = "harness-token";

// The static registry (data/accounts.yml + data/connectors.yml) fills the
// roster and the connector list until Supabase has its own rows.
const REGISTRY = registry as unknown as { accounts: Account[]; connectors: Connector[] };
const EMPTY = emptySnapshot(REGISTRY.accounts, REGISTRY.connectors);

function sessionToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Calls one of the app's API routes with this device's session token and
 * surfaces the route's own error message when it fails. */
async function appApi<T>(path: string, init?: RequestInit): Promise<T> {
  // The demo only reads its sample data; nothing goes to Meta, Apify or Supabase.
  if (DEMO && path !== "/api/data") throw new Error("This is the demo — nothing is sent anywhere. Deploy your own copy to use it (see the README).");
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken()}`, ...init?.headers },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(json.error || `${path}: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

type MetaSyncResult = { ok: boolean; campaigns: number; adsets: number; ads: number; dailyRows: number; from: string; to: string; autoOff?: { paused: AutoOffEvent[]; errors: string[] } };
type ApifySyncResult = { ok: boolean; date: string; reads: { handle: string; platform: string; followers: number | null; error: string | null }[]; posts?: { posts: number } };

interface HarnessState {
  hydrated: boolean;
  mode: SessionMode;
  snapshot: Snapshot;
  syncingPaid: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  saveAccounts: (accounts: Account[]) => Promise<void>;
  saveConnectorKey: (key: string, fields: Record<string, string>) => Promise<void>;
  /** Meta (and AppStack, when set up) → Supabase, then reload. Resolves
   * with the ads auto-off paused on this sync. */
  syncPaid: () => Promise<AutoOffEvent[]>;
  /** Turn auto-off on or off, or move its cost limit. */
  saveAutoOff: (change: Partial<AutoOffRule>) => Promise<void>;
  syncMeta: (days?: number) => Promise<MetaSyncResult>;
  /** Apify: latest posts + follower counts for every roster account. */
  syncApify: () => Promise<ApifySyncResult>;
  /** Pause/resume a campaign, ad set or ad, or set an ad set's daily budget. */
  metaControl: (level: "campaign" | "adset" | "ad", id: string, change: { status?: "ACTIVE" | "PAUSED"; dailyBudget?: number }) => Promise<void>;
  /** Run an organic Instagram post as an ad in the promote ad set. */
  promote: (postId: string) => Promise<void>;
}

export const useHarness = create<HarnessState>((set, get) => ({
  hydrated: false,
  mode: "locked",
  snapshot: EMPTY,
  syncingPaid: false,

  init: async () => {
    if (get().hydrated) return;
    if (DEMO) {
      set({ mode: "live" });
      await get().refresh();
      set({ hydrated: true });
      return;
    }
    if (!sessionToken()) {
      set({ hydrated: true, mode: "locked" });
      return;
    }
    set({ mode: "live" });
    await get().refresh();
    set({ hydrated: true });
  },

  refresh: async () => {
    if (!sessionToken() && !DEMO) return;
    try {
      const live = await appApi<{ configured: boolean; snapshot?: Snapshot }>("/api/data");
      if (live.configured && live.snapshot) {
        const s = live.snapshot;
        // Supabase may not have the roster / registry rows yet — keep the
        // static ones rather than showing nothing.
        set({
          snapshot: {
            ...s,
            accounts: s.accounts.length ? s.accounts : REGISTRY.accounts,
            connectors: s.connectors.length ? s.connectors : REGISTRY.connectors,
          },
        });
      }
    } catch {}
  },

  unlock: async (password) => {
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? "wrong password" : `unlock: ${res.status}`);
    const { token } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);
    window.location.reload();
  },

  lock: () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  },

  saveAccounts: async (accounts) => {
    if (get().mode === "locked") throw new Error("locked");
    set({ snapshot: { ...get().snapshot, accounts } });
    await appApi("/api/accounts", { method: "PUT", body: JSON.stringify({ accounts }) });
    await get().refresh();
  },

  saveConnectorKey: async (key, fields) => {
    if (get().mode === "locked") throw new Error("locked");
    await appApi("/api/connector-keys", { method: "POST", body: JSON.stringify({ key, fields }) });
  },

  syncPaid: async () => {
    if (get().syncingPaid) return [];
    set({ syncingPaid: true });
    try {
      const results = await Promise.allSettled([
        appApi<MetaSyncResult>("/api/meta/sync", { method: "POST", body: JSON.stringify({ days: 14 }) }),
        // Optional connector: answers { skipped } when it isn't set up.
        appApi("/api/appstack/sync", { method: "POST", body: "{}" }),
      ]);
      await get().refresh();
      const failures = results.flatMap((r, i) => (r.status === "rejected" ? [`${["Meta", "AppStack"][i]}: ${r.reason instanceof Error ? r.reason.message : "sync failed"}`] : []));
      if (failures.length) throw new Error(failures.join("; "));
      const autoOff = results[0].status === "fulfilled" ? results[0].value.autoOff : undefined;
      if (autoOff?.errors.length) throw new Error(`Auto-off: ${autoOff.errors.join("; ")}`);
      return autoOff?.paused ?? [];
    } finally {
      set({ syncingPaid: false });
    }
  },

  saveAutoOff: async (change) => {
    if (get().mode === "locked") throw new Error("locked");
    const prev = get().snapshot;
    set({ snapshot: { ...prev, autoOff: { ...prev.autoOff, ...change } } });
    try {
      await appApi("/api/auto-off", { method: "PUT", body: JSON.stringify(change) });
    } catch (err) {
      set({ snapshot: { ...get().snapshot, autoOff: prev.autoOff } });
      throw err;
    }
  },

  syncMeta: async (days = 14) => {
    if (get().mode === "locked") throw new Error("locked");
    const res = await appApi<MetaSyncResult>("/api/meta/sync", { method: "POST", body: JSON.stringify({ days }) });
    await get().refresh();
    return res;
  },

  syncApify: async () => {
    if (get().mode === "locked") throw new Error("locked");
    const res = await appApi<ApifySyncResult>("/api/apify/sync", { method: "POST", body: "{}" });
    await get().refresh();
    return res;
  },

  metaControl: async (level, id, change) => {
    if (get().mode === "locked") throw new Error("locked");
    const needsConfirmation = change.status === "ACTIVE" || change.dailyBudget != null;
    if (!DEMO && needsConfirmation && !window.confirm(change.dailyBudget != null
      ? `Set this ad set's daily budget to ${change.dailyBudget} in the ad account's currency? This changes the shared budget for its ads. Check Ads Manager before continuing.`
      : `Activate this ${level} on Meta? It can spend the existing campaign/ad set budget once Meta approves it. Check the destination, audience and budget in Ads Manager first.`)) {
      throw new Error("Action cancelled; nothing sent to Meta.");
    }
    await appApi("/api/meta/control", { method: "POST", body: JSON.stringify({ level, id, ...change, confirmed: needsConfirmation }) });
    await get().refresh();
  },

  promote: async (postId) => {
    if (get().mode === "locked") throw new Error("locked");
    await appApi("/api/promote", { method: "POST", body: JSON.stringify({ postId, confirmed: true }) });
    await get().refresh();
  },
}));
