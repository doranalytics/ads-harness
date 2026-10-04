"use client";
// One store. Every read comes from Supabase through the app's own API
// routes (app/api/data); every action (promote, pause, budget, sync) is an
// API route that talks to Meta or Apify server-side. There is no demo:
// without the password on this device the app shows the sign-in screen,
// and with it, whatever has actually synced — empty states included.
import { create } from "zustand";
import registry from "./generated/registry.json";
import { Account, Connector, SessionMode, Snapshot, emptySnapshot } from "./types";

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

type MetaSyncResult = { ok: boolean; campaigns: number; adsets: number; ads: number; dailyRows: number; from: string; to: string };
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
  /** Meta (and AppStack, when set up) → Supabase, then reload. */
  syncPaid: () => Promise<void>;
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
    if (!sessionToken()) {
      set({ hydrated: true, mode: "locked" });
      return;
    }
    set({ mode: "live" });
    await get().refresh();
    set({ hydrated: true });
  },

  refresh: async () => {
    if (!sessionToken()) return;
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
    if (get().syncingPaid) return;
    set({ syncingPaid: true });
    try {
      const results = await Promise.allSettled([
        appApi("/api/meta/sync", { method: "POST", body: JSON.stringify({ days: 2 }) }),
        // Optional connector: answers { skipped } when it isn't set up.
        appApi("/api/appstack/sync", { method: "POST", body: "{}" }),
      ]);
      await get().refresh();
      const failures = results.flatMap((r, i) => (r.status === "rejected" ? [`${["Meta", "AppStack"][i]}: ${r.reason instanceof Error ? r.reason.message : "sync failed"}`] : []));
      if (failures.length) throw new Error(failures.join("; "));
    } finally {
      set({ syncingPaid: false });
    }
  },

  syncMeta: async (days = 2) => {
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
    await appApi("/api/meta/control", { method: "POST", body: JSON.stringify({ level, id, ...change }) });
    await get().refresh();
  },

  promote: async (postId) => {
    if (get().mode === "locked") throw new Error("locked");
    await appApi("/api/promote", { method: "POST", body: JSON.stringify({ postId }) });
    await get().refresh();
  },
}));
