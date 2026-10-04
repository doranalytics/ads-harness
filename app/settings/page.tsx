"use client";
// Settings — the roster of handles the harness watches, and the keys for
// every connector. Keys save server-side only and are never echoed back.
import { useState } from "react";
import { Check, KeyRound, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHarness } from "@/lib/store";
import { Account, PLATFORM_META, Platform } from "@/lib/types";

type KeyField = { id: string; label: string; placeholder: string; secret?: boolean; help?: string };
const KEY_FIELDS: { connector: string; name: string; note?: string; fields: KeyField[] }[] = [
  {
    connector: "meta-ads",
    name: "Meta Ads",
    note: "Where each of these comes from: docs/meta-business-setup.md. Save any field on its own — the others are kept.",
    fields: [
      { id: "access_token", label: "Access token", placeholder: "EAAG… (System User token)", secret: true },
      { id: "ad_account_id", label: "Ad account id", placeholder: "act_1234567890" },
      { id: "adset_id", label: "Promote ad set id", placeholder: "1202…", help: "every Promote lands here" },
      { id: "page_id", label: "Facebook Page id", placeholder: "1029…" },
      { id: "link", label: "Ad link", placeholder: "https://yoursite.com", help: "where the ad sends people" },
      { id: "cta", label: "Button", placeholder: "LEARN_MORE", help: "SHOP_NOW, SIGN_UP, BOOK_NOW…" },
    ],
  },
  { connector: "apify", name: "Apify", note: "apify.com → Settings → API & Integrations → Personal API token.", fields: [{ id: "token", label: "API token", placeholder: "apify_api_…", secret: true }] },
  {
    connector: "appstack",
    name: "AppStack (optional — only for promoting a mobile app)",
    fields: [
      { id: "mcp_key", label: "MCP key", placeholder: "project-scoped key", secret: true },
      { id: "app_id", label: "App id", placeholder: "App Store id, e.g. 1234567890" },
    ],
  },
];

/** Account ids follow "<platform prefix>-<handle>": the syncs key posts and
 * followers off it (an Instagram account is always ig-<handle>). */
const ID_PREFIX: Record<Platform, string> = { instagram: "ig", tiktok: "tt", x: "x", youtube: "yt", facebook: "fb" };
const withId = (a: Account): Account => ({ ...a, id: `${ID_PREFIX[a.platform]}-${a.handle.trim().replace(/^@/, "").toLowerCase()}` });

function AccountRow({
  account,
  onChange,
  onRemove,
}: {
  account: Account;
  onChange: (a: Account) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={account.platform}
        onChange={(e) => onChange({ ...account, platform: e.target.value as Platform })}
        className="h-9 w-28 shrink-0 rounded-md border bg-transparent px-2 text-sm"
        aria-label="Platform"
      >
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
          <option key={p} value={p}>
            {PLATFORM_META[p].label}
          </option>
        ))}
      </select>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
        <Input
          className="pl-7"
          value={account.handle}
          onChange={(e) => onChange({ ...account, handle: e.target.value.replace(/^@/, "").trim() })}
          placeholder="handle"
          aria-label="Handle"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...account, kind: account.kind === "personal" ? "brand" : "personal" })}
        className="w-20 shrink-0 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        title="Toggle personal / brand"
      >
        {account.kind}
      </button>
      <button type="button" onClick={onRemove} aria-label="Remove account" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-red-600">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function ConnectorKeys() {
  const { saveConnectorKey } = useHarness();
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const save = async (connector: string) => {
    const fields = values[connector] ?? {};
    if (!Object.values(fields).some((v) => v.trim())) return;
    setSaving(connector);
    try {
      await saveConnectorKey(connector, fields);
      setSavedKeys(new Set([...savedKeys, connector]));
      setValues({ ...values, [connector]: {} });
      toast.success("Saved", { description: "Run a sync from the Connectors tab to check it works." });
    } catch (err) {
      if (err instanceof Error && err.message === "locked") {
        toast.error("Sign in first", {
          description: "Keys save server-side only (never in the browser) and need the password on this device.",
        });
      } else {
        toast.error("Couldn't save", { description: err instanceof Error ? err.message : "try again" });
      }
    }
    setSaving(null);
  };

  return (
    <div className="space-y-3">
      {KEY_FIELDS.map(({ connector, name, note, fields }) => (
        <div key={connector} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">{name}</p>
            {savedKeys.has(connector) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700">
                <Check className="size-3" /> saved
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1.5 text-xs"
              disabled={saving === connector || !Object.values(values[connector] ?? {}).some((v) => v.trim())}
              onClick={() => save(connector)}
            >
              {saving === connector ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save
            </Button>
          </div>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-2" title={f.help}>
                <span className="w-32 shrink-0 text-xs text-muted-foreground">{f.label}</span>
                <Input
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  className="h-8 flex-1 font-mono text-xs"
                  placeholder={f.placeholder}
                  value={values[connector]?.[f.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [connector]: { ...values[connector], [f.id]: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Keys are write-only: they go straight to the server, and are never shown again in any browser. To change one, type the new value and save.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { mode, snapshot, saveAccounts, lock } = useHarness();
  // Unsaved edits; null means "show what's saved".
  const [edits, setAccounts] = useState<Account[] | null>(null);
  const accounts = edits ?? snapshot.accounts;
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(accounts.map(({ id, platform, handle, label, kind }) => ({ id, platform, handle, label, kind }))) !==
    JSON.stringify(snapshot.accounts.map(({ id, platform, handle, label, kind }) => ({ id, platform, handle, label, kind })));

  const save = async () => {
    setSaving(true);
    try {
      await saveAccounts(accounts.filter((a) => a.handle.trim()).map(withId));
      setAccounts(null);
      toast.success("Roster saved", {
        description: "Sync Apify from the Connectors tab to pull its posts now, or wait for the daily run.",
      });
    } catch (err) {
      toast.error("Couldn't save", { description: err instanceof Error ? err.message : "try again" });
    }
    setSaving(false);
  };

  const add = () =>
    setAccounts([
      ...accounts,
      { id: `new-${Math.random().toString(36).slice(2, 8)}`, platform: "instagram", handle: "", label: "", kind: "brand" },
    ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="wordmark text-2xl lowercase">settings</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        The accounts the harness watches and the keys for each connector. Start with your Instagram handle, then Apify, then Meta Ads.
      </p>

      <h2 className="mt-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Accounts</h2>
      <div className="mt-3 space-y-2">
        {accounts.map((a, i) => (
          <AccountRow
            key={a.id}
            account={a}
            onChange={(next) => setAccounts(accounts.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setAccounts(accounts.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="size-3.5" /> Add account
        </Button>
        <Button size="sm" className="ml-auto gap-1.5" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {dirty ? "Save roster" : "Saved"}
        </Button>
      </div>

      <h2 className="mt-8 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Connector keys</h2>
      <div className="mt-3">
        <ConnectorKeys />
      </div>

      {mode !== "locked" && (
        <button type="button" onClick={lock} className="mt-8 font-mono text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
          sign out on this device
        </button>
      )}
    </div>
  );
}
