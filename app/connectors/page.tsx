"use client";
// Connectors — where every number comes from, and whether that pipe is
// live. Keys go in via Settings; each card can run its sync on demand.
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHarness } from "@/lib/store";
import { ConnectorStatus } from "@/lib/types";

const STATUS: Record<ConnectorStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  wired: { label: "wired", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CircleCheck },
  "needs-keys": { label: "needs keys", cls: "border-amber-200 bg-amber-50 text-amber-700", icon: KeyRound },
  planned: { label: "planned", cls: "border-border bg-secondary text-muted-foreground", icon: CircleDashed },
};

export default function ConnectorsPage() {
  const { hydrated, snapshot, syncApify, syncMeta } = useHarness();
  const [busy, setBusy] = useState<"apify" | "meta" | null>(null);
  // Real data age per pipe, straight from the tables — a green badge alone
  // can sit there for days while nothing syncs.
  const lastData: Record<string, string | null | undefined> = { "meta-ads": snapshot.adsSyncedAt, apify: snapshot.postsSyncedAt, appstack: snapshot.appstackReport?.syncedAt };
  // The crons run daily; call a pipe stale after a day and a half.
  const STALE_MS = 36 * 3600_000;
  // One clock read per mount: ages don't need to tick while you look at them.
  const [now] = useState(() => Date.now());
  const age = (iso: string) => { const m = Math.max(0, now - new Date(iso).getTime()) / 60000; return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
  const pullMeta = async () => {
    setBusy("meta");
    try {
      const r = await syncMeta(2);
      toast.success(`Meta synced: ${r.campaigns} campaigns · ${r.adsets} ad sets · ${r.ads} ads · ${r.dailyRows} daily rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Meta sync failed");
    }
    setBusy(null);
  };

  const pullFollowers = async () => {
    setBusy("apify");
    try {
      const r = await syncApify();
      const ok = r.reads.filter((x) => x.followers !== null);
      const dead = r.reads.filter((x) => x.error);
      toast[ok.length ? "success" : "error"](`${r.posts?.posts ?? 0} posts synced · followers read for ${ok.length} of ${r.reads.length} accounts`, {
        description: dead.length ? `not found: ${dead.map((d) => `${d.platform}/@${d.handle}`).join(", ")}` : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sync failed");
    }
    setBusy(null);
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="wordmark text-2xl lowercase">connectors</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Apify feeds the Organic tab, Meta Ads feeds Paid and runs Promote. AppStack is only for businesses promoting a mobile app.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.connectors.map((c) => {
          const last = lastData[c.key];
          const stale = c.status === "wired" && last !== undefined && (!last || now - new Date(last).getTime() > STALE_MS);
          const s = stale ? { label: last ? `stale · ${age(last)}` : "no data", cls: "border-amber-200 bg-amber-50 text-amber-700", icon: CircleDashed } : STATUS[c.status] ?? STATUS.planned;
          const Icon = s.icon;
          return (
            <div key={c.key} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <p className="font-medium">{c.name}</p>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{c.role}</span>
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] ${s.cls}`}>
                  <Icon className="size-3" /> {s.label}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{c.summary}</p>
              <div className="mt-3 space-y-1 border-t pt-3 font-mono text-[11px]">
                <p><span className="text-muted-foreground">unlocks · </span>{c.unlocks}</p>
                {c.needs ? <p><span className="text-muted-foreground">needs · </span>{c.needs}</p> : null}
                {last ? <p><span className="text-muted-foreground">last data · </span>{age(last)} ago</p> : null}
              </div>
              {c.key === "meta-ads" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={pullMeta} disabled={busy !== null}>
                    <RefreshCw className={`size-3.5 ${busy === "meta" ? "animate-spin" : ""}`} />
                    Sync now
                  </Button>
                </div>
              )}
              {c.key === "apify" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={pullFollowers} disabled={busy !== null}>
                    <RefreshCw className={`size-3.5 ${busy === "apify" ? "animate-spin" : ""}`} />
                    Sync posts + followers
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Drop the keys in{" "}
        <Link href="/settings" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
          Settings <ArrowUpRight className="size-3" />
        </Link>{" "}
        — every pipe syncs once a day on its own (Vercel Cron) and on Sync now. A badge turns amber when a pipe is
        more than a day and a half behind.
      </p>
    </div>
  );
}
