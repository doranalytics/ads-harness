"use client";
// Paid: the Meta ad account as one surface — a date range, the headline
// cost (cost per result, or AppStack CPI when that's wired), and every
// campaign → ad set → ad with pause/resume, budgets and a 7-day cost line.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, Pause, Play, RefreshCw, Search } from "lucide-react";
import { PaidSummary, type PaidPreset } from "@/components/paid-summary";
import { RoasChart, type RoasDay, type RoasMetric } from "@/components/roas-chart";
import { PaidAds } from "@/components/paid-ads";
import { COST_LABEL, costByDay, costSource } from "@/lib/cost";
import { DEMO } from "@/lib/demo";
import { adPeriodMetrics, dayOffset, sumPaidMetrics, type PaidRange } from "@/lib/paid-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fmtMoney } from "@/components/charts";
import { useHarness } from "@/lib/store";
import { Ad, AdSet } from "@/lib/types";
import { cn } from "@/lib/utils";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_APP_PROMOTION: "App promotion",
  OUTCOME_SALES: "Sales",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_LEADS: "Leads",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
};
const objectiveLabel = (o: string | null) => (o ? OBJECTIVE_LABEL[o] ?? o.replace(/^OUTCOME_/, "").toLowerCase() : "—");

function StatusChip({ status, effective }: { status: string; effective: string | null }) {
  const s = (effective ?? status).toUpperCase();
  const tone =
    s === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
    : s === "PENDING_REVIEW" || s === "IN_PROCESS" || s === "PREAPPROVED" ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
    : s === "PAUSED" || s === "CAMPAIGN_PAUSED" || s === "ADSET_PAUSED" ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
    : "border-border bg-secondary text-muted-foreground";
  const label = s === "PENDING_REVIEW" || s === "IN_PROCESS" || s === "PREAPPROVED" ? "in review" : s.replace(/_/g, " ").toLowerCase();
  return <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", tone)}>{label}</span>;
}

const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads" };

/** The parameters that decide whether AppStack can attribute at all: where
 *  the ad runs, and the event the set optimises for. */
function adsetParams(sets: { publisherPlatforms: string[] | null; userOs: string[] | null; promotedEvent: string | null }[]) {
  const platforms = [...new Set(sets.flatMap((g) => g.publisherPlatforms ?? []))].map((p) => PLATFORM_LABEL[p] ?? p);
  const os = [...new Set(sets.flatMap((g) => g.userOs ?? []))];
  const events = [...new Set(sets.map((g) => g.promotedEvent).filter(Boolean))] as string[];
  return { platforms, os, events };
}

export default function PaidPage() {
  const { hydrated, snapshot, syncPaid, syncingPaid, metaControl } = useHarness();
  // Opens on the last 7 full days. "All time" runs from the first day the
  // data covers.
  const [preset, setPreset] = useState<PaidPreset>("7");
  const [trendMetric, setTrendMetric] = useState<RoasMetric>("cpi");
  const [pickedRange, setRange] = useState<PaidRange>(() => ({ from: dayOffset(-7), to: dayOffset(-1) }));
  const range = useMemo<PaidRange>(() => {
    if (preset !== "all") return pickedRange;
    const firstMeta = (snapshot.metaAdDays ?? []).reduce<string | null>((m, r) => (!m || r.date < m ? r.date : m), null);
    const from = snapshot.appstackReport?.from ?? firstMeta ?? dayOffset(-90);
    return { from, to: dayOffset(0) };
  }, [preset, pickedRange, snapshot.metaAdDays, snapshot.appstackReport?.from]);
  const periodMetrics = useMemo(() => new Map(snapshot.ads.map((a) => [a.id, adPeriodMetrics(snapshot, a, range)])), [snapshot, range]);
  // The headline cost per ad per day, last 7 days of data — not the page
  // range: this is the "is it getting worse right now" view.
  const source = costSource(snapshot);
  const L = COST_LABEL[source];
  const costDays = useMemo(() => new Map(snapshot.ads.map((a) => [a.id, costByDay(snapshot, new Set([a.id]), 7)])), [snapshot]);
  // The cost line an ad gets flagged over. Per browser; edit it in the
  // toolbar. Empty (no alert) until someone sets one.
  const startAlert = DEMO ? 9 : null; // the demo shows the red days
  const [costAlert, setCostAlertState] = useState<number | null>(() => {
    if (typeof window === "undefined") return startAlert;
    try {
      const v = window.localStorage.getItem("harness.costAlert");
      return v == null ? startAlert : v ? Number(v) : null;
    } catch {
      return startAlert;
    }
  });
  const setCostAlert = (v: number | null) => {
    setCostAlertState(v);
    try { window.localStorage.setItem("harness.costAlert", v == null ? "" : String(v)); } catch {}
  };
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "paused">("active");
  const [sort, setSort] = useState<"newest" | "oldest" | "spend">("newest");
  const [showArchived, setShowArchived] = useState(false);
  const channel = "meta";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [budgetSet, setBudgetSet] = useState("");
  const [budget, setBudget] = useState("");
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const archivedCount = snapshot.campaigns.filter((c) => c.archived).length;
  const visibleCampaigns = useMemo(
    () => snapshot.campaigns.filter((c) => c.channel === channel && (showArchived || !c.archived)),
    [snapshot.campaigns, channel, showArchived]
  );
  // Ads belonging to a hidden campaign shouldn't inflate the counts either.
  const visibleAds = useMemo(
    () => snapshot.ads.filter((a) => visibleCampaigns.some((c) => c.id === a.campaignId)),
    [snapshot.ads, visibleCampaigns]
  );

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const { campaigns, ads, adsets, posts, adsSyncedAt, connectors } = snapshot;

  const postById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  // Campaign -> ad set -> ad, the same spine Meta uses. Filtering happens on
  // the ads, then empty groups fall away, so a search for an ad name never
  // leaves a hollow campaign card behind.
  // Switched on = active. An ad Meta is still reviewing (PENDING_REVIEW,
  // IN_PROCESS, PREAPPROVED) is on and counts as active.
  const isActive = (a: { status: string; effectiveStatus: string | null }) =>
    ["ACTIVE", "PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"].includes((a.effectiveStatus ?? a.status).toUpperCase());

  const { tree, shownAds } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
    const matches = (a: Ad) => {
      if (stateFilter === "active" && !isActive(a)) return false;
      if (stateFilter === "paused" && isActive(a)) return false;
      if (!needle) return true;
      return [a.name, a.adsetName ?? "", campaignName.get(a.campaignId ?? "") ?? a.campaignName ?? "", a.id]
        .some((f) => f.toLowerCase().includes(needle));
    };
    const kept = visibleAds.filter(matches);

    // Seed the shape from the real ad sets so a brand-new empty one still
    // shows with its budget; ads then drop into their set.
    const setsById = new Map<string, { set: AdSet | null; campaignId: string; name: string; ads: Ad[] }>();
    const inView = new Set(visibleCampaigns.map((c) => c.id));
    for (const g of adsets) {
      if (!g.campaignId || !inView.has(g.campaignId)) continue;
      setsById.set(g.id, { set: g, campaignId: g.campaignId ?? "__none", name: g.name, ads: [] });
    }
    for (const a of kept) {
      const id = a.adsetId ?? a.adsetName ?? "__none";
      const cur = setsById.get(id);
      if (cur) cur.ads.push(a);
      else setsById.set(id, { set: null, campaignId: a.campaignId ?? "__none", name: a.adsetName ?? id, ads: [a] });
    }

    const archived = new Set(campaigns.filter((c) => c.archived).map((c) => c.id));
    const campaignIds = new Set<string>();
    for (const v of setsById.values()) campaignIds.add(v.campaignId);
    for (const a of kept) if (a.campaignId && inView.has(a.campaignId)) campaignIds.add(a.campaignId);

    const groups = [...campaignIds].filter((cid) => showArchived || !archived.has(cid)).map((cid) => {
      const c = campaigns.find((x) => x.id === cid);
      const mine = [...setsById.values()].filter((v) => v.campaignId === cid);
      const list = mine.flatMap((v) => v.ads);
      const built = mine
        .map((v) => ({
          id: v.set?.id ?? v.name,
          name: v.name,
          dailyBudget: v.set?.dailyBudget ?? null,
          status: v.set?.status ?? null,
          effectiveStatus: v.set?.effectiveStatus ?? null,
          ads: [...v.ads].sort((x, y) => (periodMetrics.get(y.id)?.spend ?? 0) - (periodMetrics.get(x.id)?.spend ?? 0)),
          spend: sum(v.ads.map((a) => periodMetrics.get(a.id)?.spend ?? 0)),
          trials: sum(v.ads.map((a) => periodMetrics.get(a.id)?.trials ?? 0)),
        }))
        .sort((x, y) => y.spend - x.spend || x.name.localeCompare(y.name));
      return {
        id: cid,
        name: c?.name ?? list[0]?.campaignName ?? "No campaign",
        objective: c?.objective ?? null,
        status: c?.status ?? "UNKNOWN",
        effectiveStatus: c?.effectiveStatus ?? null,
        spend: sum(list.map((a) => periodMetrics.get(a.id)?.spend ?? 0)),
        adCount: list.length,
        createdAt: c?.createdAt ?? null,
        params: adsetParams(mine.map((v) => v.set).filter((x): x is AdSet => !!x)),
        adsets: built,
      };
    });

    // A search should hide empty groups; an unfiltered view should not.
    const visible = needle || stateFilter !== "all"
      ? groups.filter((g) => g.adCount > 0).map((g) => ({ ...g, adsets: g.adsets.filter((x) => x.ads.length > 0) }))
      : groups;

    const ordered = [...visible].sort((x, y) => {
      if (sort === "spend") return y.spend - x.spend;
      const a = x.createdAt ?? "";
      const b = y.createdAt ?? "";
      // A campaign with no created_at sorts last either way rather than
      // pretending to be the oldest thing on the account.
      if (!a && !b) return y.spend - x.spend;
      if (!a) return 1;
      if (!b) return -1;
      return sort === "newest" ? b.localeCompare(a) : a.localeCompare(b);
    });
    return { tree: ordered, shownAds: kept.length };
  }, [visibleAds, visibleCampaigns, adsets, campaigns, q, showArchived, sort, stateFilter, periodMetrics]);

  // Every ad set on the account, unfiltered — the budget control must be able
  // to reach a set even while the table is filtered down to something else.
  const allAdsets = useMemo(() => {
    const m = new Map<string, { id: string; name: string; campaign: string; budget: number | null }>();
    // Every ad set in a campaign currently in view.
    const inView = new Set(visibleCampaigns.map((c) => c.id));
    const retired = (cid: string | null) => !cid || !inView.has(cid);
    for (const g of adsets) {
      if (retired(g.campaignId)) continue;
      m.set(g.id, {
        id: g.id,
        name: g.name,
        campaign: campaigns.find((c) => c.id === g.campaignId)?.name ?? g.campaignName ?? "—",
        budget: g.dailyBudget,
      });
    }
    for (const a of ads) {
      const id = a.adsetId ?? a.adsetName;
      if (!id || m.has(id)) continue;
      if (retired(a.campaignId)) continue;
      m.set(id, {
        id,
        name: a.adsetName ?? id,
        campaign: campaigns.find((c) => c.id === a.campaignId)?.name ?? a.campaignName ?? "—",
        budget: null,
      });
    }
    // Grouped by campaign so an ad set from a retired campaign can never read
    // as if it lived in the one we run. Campaigns we have real ad set rows
    // for (the harness-built ones) come first.
    const known = new Set(adsets.map((g) => campaigns.find((c) => c.id === g.campaignId)?.name ?? ""));
    const byCampaign = new Map<string, typeof m extends Map<string, infer V> ? V[] : never>();
    for (const v of m.values()) {
      byCampaign.set(v.campaign, [...(byCampaign.get(v.campaign) ?? []), v]);
    }
    return [...byCampaign.entries()]
      .map(([campaign, sets]) => ({ campaign, live: known.has(campaign), sets: sets.sort((x, y) => x.name.localeCompare(y.name)) }))
      .sort((x, y) => Number(y.live) - Number(x.live) || x.campaign.localeCompare(y.campaign));
  }, [ads, adsets, campaigns, visibleCampaigns]);

  const adsetById = useMemo(
    () => new Map(allAdsets.flatMap((g) => g.sets.map((x) => [x.id, x] as const))),
    [allAdsets]
  );

  // The KPI row is the whole channel for the date range — every ad,
  // including paused ones and retired campaigns. The search / state / sort /
  // retired controls below only shape the list.
  const channelAds = useMemo(() => snapshot.ads.filter((a) => a.channel === channel), [snapshot.ads, channel]);
  const totals = useMemo(() => sumPaidMetrics(channelAds.map((a) => periodMetrics.get(a.id)!)), [channelAds, periodMetrics]);
  // ROAS / CPI over time for the page's date range (clipped to the AppStack
  // window), from the first day in it the channel spent. Revenue is the PURCHASE event value; a day whose value
  // AppStack did not report is unknown, not zero.
  const roasRows = useMemo<RoasDay[]>(() => {
    const report = snapshot.appstackReport;
    if (!report) return [];
    const byDate = new Map<string, { spend: number; revenue: number; installs: number; unknown: boolean }>();
    for (const r of report.ads) {
      if (r.mediaSource !== channel) continue;
      const d = byDate.get(r.date) ?? { spend: 0, revenue: 0, installs: 0, unknown: false };
      d.spend += r.spend;
      d.installs += r.installs;
      const v = r.lifecycle?.purchase?.value;
      if (v == null) { if (r.purchases > 0) d.unknown = true; } else d.revenue += v;
      byDate.set(r.date, d);
    }
    const days: string[] = [];
    const from = range.from > report.from ? range.from : report.from;
    const to = range.to < report.to ? range.to : report.to;
    for (let t = new Date(from + "T00:00:00Z"); t.toISOString().slice(0, 10) <= to; t = new Date(t.getTime() + 86400000)) days.push(t.toISOString().slice(0, 10));
    const first = days.findIndex((d) => (byDate.get(d)?.spend ?? 0) > 0);
    if (first < 0) return [];
    return days.slice(first).map((date) => { const d = byDate.get(date); return { date, spend: d?.spend ?? 0, revenue: d?.unknown ? null : d?.revenue ?? 0, installs: d?.installs ?? 0 }; });
  }, [snapshot.appstackReport, channel, range.from, range.to]);

  const run = async (
    action: "adset-budget" | "ad-state",
    key: string,
    targetId: string,
    params: Record<string, string | number>,
    doneMsg: string
  ) => {
    setBusyOn(key);
    try {
      if (action === "ad-state") await metaControl("ad", targetId, { status: params.to as "ACTIVE" | "PAUSED" });
      else await metaControl("adset", targetId, { dailyBudget: Number(params.dailyBudget) });
      toast.success("Done on Meta", { description: doneMsg });
    } catch (err) {
      toast.error("Meta didn't take it", { description: err instanceof Error ? err.message : doneMsg });
    }
    setBusyOn(null);
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const meta = connectors.find((c) => c.key === "meta-ads");
  const wired = meta?.status === "wired";

  const synced = [adsSyncedAt, snapshot.appstackReport?.syncedAt].filter((s): s is string => !!s).sort()[0];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="wordmark text-2xl lowercase">paid</h1>
          <div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground">{synced ? `Synced ${new Date(synced).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not synced"} · daily</span>
            <Button
              variant="outline"
              size="sm"
              disabled={syncingPaid}
              aria-busy={syncingPaid}
              onClick={async () => {
                try {
                  await syncPaid();
                  toast.success("Synced");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not complete sync");
                }
              }}
            >
              <RefreshCw className={cn("size-3.5", syncingPaid && "animate-spin")} />
              {syncingPaid ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>
        {syncingPaid && <p role="status" className="mt-1 text-xs text-muted-foreground">Refreshing Meta{source === "appstack" ? " and AppStack" : ""}. This can take a minute.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-primary/40 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Meta</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {visibleCampaigns.length} campaign{visibleCampaigns.length === 1 ? "" : "s"} · {visibleAds.length} ad
          {visibleAds.length === 1 ? "" : "s"}
        </span>
      </div>

      <PaidSummary metrics={totals} range={range} setRange={setRange} preset={preset} setPreset={setPreset} source={source} minDate={snapshot.appstackReport?.from} adsCount={channelAds.length} metaSyncedAt={adsSyncedAt} appSyncedAt={snapshot.appstackReport?.syncedAt} />

      {roasRows.length > 1 && (
        <section aria-label={trendMetric === "roas" ? "ROAS over time" : "Cost per install over time"} className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="flex items-center rounded-md border p-0.5">
              {(["roas", "cpi"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTrendMetric(k)}
                  className={cn("rounded px-2 py-1 text-sm font-medium transition", trendMetric === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {k === "roas" ? "ROAS" : "Cost per install"}
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">over time · {channel} · all ads · {roasRows[0].date} → {roasRows[roasRows.length - 1].date}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Follows the date range above. {trendMetric === "roas" ? "Event ROAS: AppStack PURCHASE value ÷ AppStack spend. Not verified cash." : "AppStack spend ÷ AppStack installs."}
            </span>
          </div>
          <RoasChart rows={roasRows} metric={trendMetric} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter campaign, ad set, ad"
            aria-label="Filter campaign, ad set, or ad"
            className="h-7 w-56 rounded-md border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
          />
        </div>
        <div className="flex items-center rounded-md border p-0.5">
          {(["all", "active", "paused"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStateFilter(k)}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                stateFilter === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-md border p-0.5">
          {(["newest", "oldest", "spend"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              title={k === "spend" ? "Sort campaigns by selected-period spend" : `Sort campaigns ${k} first`}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                sort === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" title={`Flag an ad when its ${L.long.toLowerCase()} on a day goes over this. Empty turns the alert off.`}>
          alert $
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.05}
            defaultValue={costAlert ?? ""}
            onBlur={(e) => setCostAlert(e.target.value === "" || !(Number(e.target.value) > 0) ? null : Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            aria-label="Cost alert in dollars"
            className="h-6 w-12 bg-transparent text-xs text-foreground outline-none"
          />
        </label>
        {archivedCount > 0 && <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
            showArchived ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          title="Campaigns marked archived in Supabase (campaigns.archived), kept for history"
        >
          {showArchived ? "hiding nothing" : `+${archivedCount} retired`}
        </button>}
        <span className="font-mono text-[11px] text-muted-foreground">
          {shownAds} of {visibleAds.length} ad{visibleAds.length === 1 ? "" : "s"}
        </span>
      </div>

      {(
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card px-4 py-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="adset" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Ad set budget</label>
          <select
            id="adset"
            value={budgetSet}
            onChange={(e) => {
              setBudgetSet(e.target.value);
              const cur = adsetById.get(e.target.value)?.budget;
              setBudget(cur != null ? String(cur) : "");
            }}
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-primary/50"
          >
            <option value="">Select an ad set…</option>
            {allAdsets.map((grp) => (
              <optgroup key={grp.campaign} label={grp.live ? grp.campaign : `${grp.campaign} (retired)`}>
                {grp.sets.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="w-28">
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="budget" className="h-8 pl-6" type="number" min="5" step="5" placeholder="100" value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Daily budget" />
          </div>
        </div>
        <Button
          size="sm"
          className="h-8"
          disabled={!budgetSet || !Number(budget) || busyOn === "adset-budget"}
          onClick={() =>
            run("adset-budget", "adset-budget", budgetSet, { dailyBudget: Number(budget) },
              `set ${adsetById.get(budgetSet)?.name ?? "the ad set"} to $${Number(budget)}/day.`)
          }
        >
          {busyOn === "adset-budget" ? <Loader2 className="size-4 animate-spin" /> : null}
          Set
        </Button>
        <p className="ml-auto text-[11px] text-muted-foreground">Spend is controlled on the ad set — never the campaign or the ad.</p>
      </div>
      )}

      {ads.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {wired
            ? "No ads pulled yet — press Sync now, or wait for the daily sync."
            : <>Meta Ads isn&apos;t wired — see <Link href="/settings" className="underline underline-offset-2">Settings</Link>.</>}
        </div>
      ) : tree.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing matches {q ? <span className="font-mono">“{q}”</span> : "this filter"}.
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-secondary/40 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-expanded={!collapsed[c.id]}
                  aria-label={collapsed[c.id] ? `Expand ${c.name}` : `Collapse ${c.name}`}
                  className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {collapsed[c.id] ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
                <p className="font-medium" title={c.name}>{c.name}</p>
                <StatusChip status={c.status} effective={c.effectiveStatus} />
                {(() => {
                  const on = (c.effectiveStatus ?? c.status).toUpperCase() === "ACTIVE";
                  return (
                    <Button size="sm" variant="ghost" className="size-7 p-0 text-muted-foreground" title={on ? `Pause campaign ${c.name}` : `Turn campaign ${c.name} on`} disabled={busyOn === `campaign-${c.id}`}
                      onClick={async () => {
                        setBusyOn(`campaign-${c.id}`);
                        try { await metaControl("campaign", c.id, { status: on ? "PAUSED" : "ACTIVE" }); toast.success(on ? `${c.name} paused` : `${c.name} is on`); }
                        catch (err) { toast.error("Couldn't change the campaign", { description: err instanceof Error ? err.message : undefined }); }
                        setBusyOn(null);
                      }}>
                      {busyOn === `campaign-${c.id}` ? <Loader2 className="size-3.5 animate-spin" /> : on ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                  );
                })()}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {objectiveLabel(c.objective)}
                  {c.params.platforms.length > 0 ? ` · ${c.params.platforms.join(" + ")}` : ""}
                  {c.params.os.length > 0 ? ` · ${c.params.os.join("/")}` : ""}
                </span>
                {c.params.events.map((e) => (
                  <span key={e} className="rounded-full border border-primary/30 bg-accent px-2 py-0.5 font-mono text-[10px] text-accent-foreground" title="The conversion event these ad sets optimise for — Meta's “results”">
                    {e}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {fmtMoney(c.spend)} · {c.adsets.length} ad set{c.adsets.length === 1 ? "" : "s"} · {c.adCount} ad{c.adCount === 1 ? "" : "s"}
                </span>
              </div>

              {!collapsed[c.id] && c.adsets.map((g) => (
                <div key={g.id} className="border-b last:border-b-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 pl-6">
                    <button
                      type="button"
                      onClick={() => toggle(c.id + g.id)}
                      aria-expanded={!collapsed[c.id + g.id]}
                      aria-label={collapsed[c.id + g.id] ? `Expand ${g.name}` : `Collapse ${g.name}`}
                      className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      {collapsed[c.id + g.id] ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">ad set</span>
                    <p className="text-sm font-medium" title={g.name}>{g.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setBudgetSet(g.id);
                        setBudget(g.dailyBudget != null ? String(g.dailyBudget) : "");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                      title="Load this ad set into the budget control"
                    >
                      set budget
                    </button>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {g.dailyBudget != null ? `${fmtMoney(g.dailyBudget)}/day · ` : ""}
                      {fmtMoney(g.spend)} spent
                    </span>
                  </div>

                  {g.ads.length === 0 ? (
                    <p className="px-4 py-3 pl-12 text-[11px] text-muted-foreground">
                      No ads yet — promote a post from Organic and it lands here.
                    </p>
                  ) : (
                  <div className={cn(collapsed[c.id + g.id] && "hidden")}>
                    <PaidAds ads={g.ads} metrics={periodMetrics} posts={postById} costDays={costDays} costAlert={costAlert} source={source}
                      status={(a) => <StatusChip status={a.status} effective={a.effectiveStatus} />}
                      action={(a) => <Button size="sm" variant="ghost" className="size-8 shrink-0 p-0 text-muted-foreground" title={isActive(a) ? "Pause this ad" : "Resume this ad"} disabled={busyOn === a.id} onClick={() => run("ad-state", a.id, a.id, { to: isActive(a) ? "PAUSED" : "ACTIVE" }, isActive(a) ? `pause ${a.name}.` : `resume ${a.name}.`)}>
                        {busyOn === a.id ? <Loader2 className="size-3.5 animate-spin" /> : isActive(a) ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}<span className="sr-only">{isActive(a) ? "Pause" : "Resume"} {a.name}</span>
                      </Button>} />
                  </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}


    </div>
  );
}
