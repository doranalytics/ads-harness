"use client";
// Organic — your Instagram feed as a grid: each post with its cover, views,
// engagement and — once promoted — spend and cost per result (with its
// daily trend), and one button that runs it as a Meta ad. The video itself
// is never pulled; the cover links out to the real post.
import { useMemo, useState } from "react";
import { Ban, Camera, ExternalLink, Loader2, Megaphone, Play, Zap } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline, fmt, fmtMoney } from "@/components/charts";
import { useHarness } from "@/lib/store";
import { CHART, CHANNEL_COLORS, PLATFORM_META, Platform, Post, Snapshot, engagement } from "@/lib/types";
import { COST_LABEL, costByDay, costSource, type CostSource } from "@/lib/cost";
import { cn } from "@/lib/utils";

const FEED_SIZE = 500;

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`);
const money2 = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
/** cents while it's small (a fresh boost), $1.2k style once it isn't */
const spendFmt = (v: number) => (v < 100 ? money2(v) : fmtMoney(v));

function BoostDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { promote } = useHarness();
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    setBusy(true);
    try {
      await promote(post.id);
      toast.success("Running as an ad", {
        description: "The post itself is the creative — its likes and comments carry over. It goes live once Meta approves it and shares the ad set's daily budget (set in Paid).",
      });
      onClose();
    } catch (err) {
      if (err instanceof Error && err.message === "locked") {
        toast.error("Unlock the harness first");
      } else {
        toast.error("Meta didn't take it", { description: err instanceof Error ? err.message : "try again" });
      }
    }
    setBusy(false);
  };
  return (
    <Dialog open={!!post} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Promote to paid</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            The existing Instagram post becomes the ad — no re-upload, so its likes and comments show on the ad and paid
            engagement lands on the post. It joins your promote ad set (Settings → Meta Ads) and goes <strong>live as soon
            as Meta approves it</strong>, sharing that ad set&apos;s daily budget. Budget is controlled on the ad set, in Paid.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="line-clamp-2 text-xs text-muted-foreground">{post?.title}</p>
          <Button type="submit" disabled={busy} className="w-full gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            Run this post as an ad
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A promoted post's paid side, from the ads that point back at it
 * (`ads.source_post_id`). Spend is Meta's lifetime spend; cost is cost per
 * result (Meta results), or cost per install when AppStack is wired. */
interface PaidStats {
  spend: number;
  /** lifetime results (or AppStack installs); null when unknown */
  count: number | null;
  cost: number | null;
  /** cost per day over the last COST_DAYS days of data; null = nothing to divide by that day */
  daily: { date: string; cost: number | null }[];
}
const COST_DAYS = 14;

function paidStatsByPost(snapshot: Snapshot): Map<string, PaidStats> {
  const adsOf = new Map<string, Snapshot["ads"]>();
  for (const a of snapshot.ads) if (a.sourcePostId) adsOf.set(a.sourcePostId, [...(adsOf.get(a.sourcePostId) ?? []), a]);
  const out = new Map<string, PaidStats>();
  const report = snapshot.appstackReport;
  for (const [postId, ads] of adsOf) {
    const ids = new Set(ads.map((a) => a.id));
    const spend = ads.reduce((t, a) => t + a.spend, 0);
    let count: number | null;
    let cost: number | null;
    if (report) {
      // AppStack: its own spend and installs, over everything it reported.
      const rows = report.ads.filter((r) => r.adId && ids.has(r.adId));
      const asSpend = rows.reduce((t, r) => t + r.spend, 0);
      count = rows.reduce((t, r) => t + r.installs, 0);
      cost = count > 0 ? asSpend / count : null;
    } else {
      // Meta: lifetime results as Meta reports them on each ad.
      count = ads.reduce((t, a) => t + a.results, 0);
      cost = count > 0 ? spend / count : null;
    }
    const daily = costByDay(snapshot, ids, COST_DAYS).map((d) => ({ date: d.date, cost: d.cost }));
    out.set(postId, { spend, count, cost, daily });
  }
  return out;
}

/** Pooled cost of the latest 3 days with data vs the 3 before: up is worse. */
function costTrend(daily: PaidStats["daily"]): number | null {
  const known = daily.filter((d): d is { date: string; cost: number } => d.cost != null);
  if (known.length < 2) return null;
  const n = Math.min(3, Math.floor(known.length / 2));
  const avg = (xs: typeof known) => xs.reduce((t, d) => t + d.cost, 0) / xs.length;
  const recent = avg(known.slice(-n)), before = avg(known.slice(-2 * n, -n));
  return before > 0 ? recent / before - 1 : null;
}

/** `short` is the label in the narrow two-up phone grid, where a column is ~5 characters wide. */
function Stat({ label, short, value, title }: { label: string; short?: string; value: string; title?: string }) {
  return (
    <div title={title ?? `${label}: ${value}`} className="min-w-0">
      <dt className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </dt>
      <dd className="truncate font-mono text-[12px] font-medium">{value}</dd>
    </div>
  );
}

function PostCard({
  post, paid, source, handle, followers, placement, onBoost, onCancel, onResume, busy, canBoost,
}: {
  post: Post;
  source: CostSource;
  /** null when no ad points back at this post */
  paid: PaidStats | null;
  handle: string;
  /** The account's current followers — the engagement basis when views aren't public */
  followers: number | undefined;
  /** the ad that points back at this post: where it sits and what it's doing */
  placement: Placement | null;
  onBoost: () => void;
  onCancel: () => void;
  onResume: () => void;
  busy: boolean;
  /** Only Instagram posts can run as ads (the post is the creative). */
  canBoost: boolean;
}) {
  const eng = engagement(post, followers);
  const trend = paid ? costTrend(paid.daily) : null;
  const L = COST_LABEL[source];
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25">
      <a href={post.url} target="_blank" rel="noreferrer" aria-label={`Open post: ${post.title}`} className="relative block aspect-[4/5] bg-secondary">
        {post.thumbnailUrl ? (
          // Covers are plain <img>: they live in Supabase storage, not a domain
          // next/image knows, and a feed of 50 doesn't need the optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Camera className="size-8" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">{post.date}</span>
        {placement && (
          <span className={cn("absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] text-white",
            placement.state === "live" ? "bg-emerald-600" : placement.state === "review" ? "bg-sky-600" : placement.state === "paused" ? "bg-amber-600" : "bg-zinc-600")}>
            <Zap className="size-3" /> {placement.state === "review" ? "in review" : placement.state === "live" ? "live" : placement.state}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ExternalLink className="size-3.5" />
        </span>
      </a>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug">{post.title || `@${handle}`}</p>
        <dl className="mt-2 grid grid-cols-4 gap-x-1 gap-y-2 sm:gap-x-2">
          <Stat
            label="views"
            value={post.organicViews > 0 ? fmt(post.organicViews) : "n/a"}
            title={post.organicViews > 0 ? "Plays, as the platform reports them" : "Instagram publishes no view count for image and carousel posts — only the Graph API on the owned account sees reach."}
          />
          <Stat label="likes" value={fmt(post.likes)} />
          <Stat label="comments" short="cmts" value={fmt(post.comments)} />
          <Stat
            label={eng.basis === "followers" ? "eng/fol" : "eng"}
            short={eng.basis === "followers" ? "e/fol" : undefined}
            value={pct(eng.rate)}
            title={
              eng.basis === "followers"
                ? "(likes + comments) ÷ followers — the basis when views aren't public"
                : "(likes + comments + shares) ÷ views. Shares count once the Instagram Graph API is wired; until then this is likes + comments."
            }
          />
        </dl>
        {/* Paid row: its own grid so dollar values get the width they need. */}
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <Stat label="spend" value={paid && paid.spend > 0 ? spendFmt(paid.spend) : "—"} title="Meta spend on this post's ads, lifetime" />
          <Stat
            label={source === "appstack" ? "cpi" : "cost/result"}
            short={source === "appstack" ? "cpi" : "cost"}
            value={paid?.cost != null ? money2(paid.cost) : "—"}
            title={
              paid?.count != null
                ? `${L.formula} (${fmt(paid.count)} ${L.unit})`
                : paid ? `No ${L.unit} reported for this post's ads yet` : "Not running as an ad"
            }
          />
          <div className="col-span-2 min-w-0" title={`${L.long} per day — up is worse`}>
            <dt className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{source === "appstack" ? "cpi" : "cost"}/day</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-mono text-[12px]">
              {paid && paid.daily.some((d) => d.cost != null) ? (
                <>
                  <span className="min-w-0 flex-1">
                    <Sparkline
                      values={paid.daily.map((d) => d.cost)}
                      color={CHART.paid}
                      label={paid.daily.map((d) => `${d.date.slice(5)} ${d.cost == null ? `no ${L.unit}` : money2(d.cost)}`).join(" · ")}
                    />
                  </span>
                  {trend != null && Math.abs(trend) >= 0.005 && (
                    <span className={cn("shrink-0 text-[10px]", trend > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {trend > 0 ? "↑" : "↓"}{Math.abs(trend * 100).toFixed(0)}%
                    </span>
                  )}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {placement ? (
          placement.state === "paused" ? (
            // Promoted before, paused now: stats stay, the ad resumes in place.
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy} className="min-w-0 flex-1 gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" onClick={onResume} title={`Turn this post's ad back on (${placement.adset})`}>
                <Play className="size-3.5 shrink-0" />
                <span className="truncate">Resume<span className="hidden sm:inline"> on paid · {placement.adset}</span></span>
              </Button>
            </div>
          ) : (
            // Live or in review: it's on. Cancel pauses the ad (stats are kept).
            // Status on its own line, actions under it: side by side they
            // overflow the two-up phone grid.
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span title={placement.adset} className={cn("w-full truncate rounded-md border px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-wider",
                placement.state === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300")}>
                {placement.adset} · {placement.state === "live" ? "active" : "in review"}
              </span>
              <Button size="sm" variant="outline" disabled={busy} className="flex-1 gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950" onClick={onCancel} title="Pause this post's ad">
                <Ban className="size-3.5" />
                Cancel
              </Button>
            </div>
          )
        ) : canBoost && !post.promotable ? (
          <Button size="sm" disabled variant="outline" className="mt-3 w-full gap-1.5 text-muted-foreground" title={post.promotableReason ?? "Meta will not run this post as an ad"}>
            <Ban className="size-3.5" />
            Not promotable
          </Button>
        ) : canBoost ? (
          <Button size="sm" disabled={busy} className="mt-3 w-full gap-1.5" onClick={onBoost}>
            <Megaphone className="size-3.5" />
            Promote to paid
          </Button>
        ) : null}
      </div>
    </article>
  );
}

type PlacementState = "live" | "review" | "paused" | "other";
interface Placement { adId: string; adset: string; state: PlacementState }
const PLACEMENT_FILTERS = ["all", "running", "in review", "paused", "not paid"] as const;
type PlacementFilter = (typeof PLACEMENT_FILTERS)[number];
// spend: most first; cost: cheapest first. Posts without a value sink to the end.
const SORTS = ["newest", "views", "engagement", "spend", "cost"] as const;
type SortKey = (typeof SORTS)[number];

export default function OrganicPage() {
  const { hydrated, snapshot, metaControl } = useHarness();
  const [boosting, setBoosting] = useState<Post | null>(null);
  // "running" is delivering now; "in review" is switched on but not yet
  // running; "not paid" is the pool to pick the next boost from .
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const { accounts, posts, ads, connectors, postsSyncedAt } = snapshot;
  const paidOf = useMemo(() => paidStatsByPost(snapshot), [snapshot]);
  const source = costSource(snapshot);
  const igAccounts = useMemo(() => accounts.filter((a) => a.platform === platform), [accounts, platform]);
  const primary = igAccounts.find((a) => a.kind === "brand") ?? igAccounts[0];
  const canBoost = platform === "instagram";

  const handleById = useMemo(() => new Map(accounts.map((a) => [a.id, a.handle])), [accounts]);

  // Which ad set a post is running in, from the ad that points back at it.
  // Ads pulled straight off the account carry no source_post_id, so most
  // posts read as not-running until they are promoted through the harness.
  const placementOf = useMemo(() => {
    const m = new Map<string, Placement>();
    const stateOf = (s: string): PlacementState =>
      s === "ACTIVE" ? "live" : ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"].includes(s) ? "review"
      : ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(s) ? "paused" : "other";
    const rank: Record<PlacementState, number> = { live: 3, review: 2, paused: 1, other: 0 };
    for (const a of ads) {
      if (!a.sourcePostId || !a.adsetName) continue;
      const st = (a.effectiveStatus ?? a.status).toUpperCase();
      if (st === "DELETED" || st === "ARCHIVED") continue;
      const next: Placement = { adId: a.id, adset: a.adsetName, state: stateOf(st) };
      const prev = m.get(a.sourcePostId);
      if (!prev || rank[next.state] > rank[prev.state]) m.set(a.sourcePostId, next); // the most alive ad wins
    }
    return m;
  }, [ads]);

  const feed = useMemo(() => {
    const ids = new Set(igAccounts.map((a) => a.id));
    const all = posts
      .filter((p) => ids.has(p.accountId))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, FEED_SIZE);
    const placed =
      placementFilter === "all" ? all
      : placementFilter === "not paid" ? all.filter((p) => !placementOf.has(p.id))
      : placementFilter === "running" ? all.filter((p) => placementOf.get(p.id)?.state === "live")
      : placementFilter === "in review" ? all.filter((p) => placementOf.get(p.id)?.state === "review")
      : all.filter((p) => placementOf.get(p.id)?.state === "paused");
    if (sortBy === "newest") return placed;
    // Unknown values (views not public, no engagement read) sink to the end.
    const key = (p: Post): number | null => {
      const paid = paidOf.get(p.id);
      if (sortBy === "views") return p.organicViews || null;
      if (sortBy === "spend") return paid?.spend || null;
      if (sortBy === "cost") return paid?.cost != null ? -paid.cost : null; // negated: cheapest first
      return engagement(p, primary?.followers).rate;
    };
    return [...placed].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka == null ? (kb == null ? 0 : 1) : kb == null ? -1 : kb - ka;
    });
  }, [posts, igAccounts, placementFilter, placementOf, paidOf, sortBy, primary?.followers]);

  const runPaid = async (action: "pause" | "resume", post: Post, doneMsg: string) => {
    const pl = placementOf.get(post.id);
    if (!pl) return;
    setBusyOn(post.id);
    try {
      await metaControl("ad", pl.adId, { status: action === "pause" ? "PAUSED" : "ACTIVE" });
      toast.success(action === "pause" ? "Ad paused on Meta" : "Ad is back on", { description: doneMsg });
    } catch (err) {
      toast.error("Meta didn't take it", { description: err instanceof Error ? err.message : doneMsg });
    }
    setBusyOn(null);
  };

  const apify = connectors.find((c) => c.key === "apify");

  if (!hydrated) {
    return (
      <div className="space-y-4">

        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const chip = (active: boolean, disabled = false) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active && "border-primary/40 bg-accent text-accent-foreground",
      !active && !disabled && "text-muted-foreground hover:text-foreground",
      disabled && "cursor-not-allowed border-dashed text-muted-foreground/40"
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wordmark text-2xl lowercase">organic</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {primary ? (
              <>
                <a href={PLATFORM_META[platform].url(primary.handle)} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                  {PLATFORM_META[platform].display(primary.handle)}
                </a>{" "}
                on {PLATFORM_META[platform].label} · latest posts · tap a cover to open the post
              </>
            ) : (
              `No ${PLATFORM_META[platform].label} account in the roster — add one in Settings.`
            )}
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {postsSyncedAt ? `synced ${postsSyncedAt.slice(0, 16).replace("T", " ")}` : "not synced yet"}
        </p>
      </div>

      {/* Every channel in the roster. Tap one to switch the feed below. */}
      <div className="flex flex-wrap items-center gap-2">
        {[...accounts]
          .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
          .map((a) => {
            const meta = PLATFORM_META[a.platform];
            const active = a.platform === platform;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setPlatform(a.platform)}
                className={cn(chip(active), "inline-flex items-center gap-1.5")}
                title={`Show the ${meta.label} feed`}
              >
                <span className="size-1.5 rounded-full" style={{ background: CHANNEL_COLORS[a.platform] }} />
                {meta.display(a.handle)}
                <span className="font-mono text-[10px] text-muted-foreground">{a.followers ? fmt(a.followers) : "—"}</span>
              </button>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Show</span>
        <div className="flex flex-wrap items-center rounded-md border p-0.5">
          {PLACEMENT_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPlacementFilter(k)}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                placementFilter === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{placementOf.size} promoted</span>
        </div>
        <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sort</span>
        <div className="flex flex-wrap items-center rounded-md border p-0.5">
          {SORTS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortBy(k)}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                sortBy === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        </div>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{feed.length} posts</span>
      </div>


      {feed.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Camera className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No posts yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Apify pulls the latest posts from {primary ? `@${primary.handle}` : "your Instagram account"} once a day, or right away from Connectors → Sync.
            {apify?.status !== "wired" && " It needs the Apify token — save it in Settings first."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/settings" className="inline-flex h-7 items-center rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-secondary">
              Settings
            </Link>
            {primary && (
              <a
                href={PLATFORM_META.instagram.url(primary.handle)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Open @{primary.handle} <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {feed.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              paid={paidOf.get(p.id) ?? null}
              source={source}
              handle={handleById.get(p.accountId) ?? ""}
              placement={placementOf.get(p.id) ?? null}
              busy={busyOn === p.id}
              canBoost={canBoost}
              followers={primary?.followers}
              onBoost={() => setBoosting(p)}
              onCancel={() => runPaid("pause", p, `pause the ad for ${p.title.slice(0, 40)}.`)}
              onResume={() => runPaid("resume", p, `resume the ad for ${p.title.slice(0, 40)}.`)}
            />
          ))}
        </div>
      )}

      <BoostDialog post={boosting} onClose={() => setBoosting(null)} />
    </div>
  );
}
