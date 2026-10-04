import type { ReactNode } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import type { Ad, Post } from "@/lib/types";
import { type PaidMetrics, paidRates } from "@/lib/paid-report";
import { count, money, percent, multiple } from "@/components/paid-summary";
import { Sparkline } from "@/components/charts";
import { COST_LABEL, type CostDay, type CostSource, overAlert } from "@/lib/cost";
import { CHART } from "@/lib/types";
import { cn } from "@/lib/utils";

const usd = (v: number) => `$${v.toFixed(2)}`;

/** The latest day the ad spent or converted: what "cost is high right now" reads. */
const latestActive = (days: CostDay[]) => days.findLast((d) => d.spend > 0 || d.count > 0) ?? null;

/** Chip beside the ad's status when its latest active day is over the alert line. */
function CostAlertChip({ days, alert, source }: { days: CostDay[]; alert: number | null; source: CostSource }) {
  const d = latestActive(days);
  if (alert == null || !d || !overAlert(d, alert)) return null;
  const L = COST_LABEL[source];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] uppercase text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      title={`${L.long} on ${d.date}: ${d.cost != null ? usd(d.cost) : `${usd(d.spend)} spent, no ${L.unit}`} — alert is ${usd(alert)}`}
    >
      {L.short} {d.cost != null ? usd(d.cost) : `no ${L.unit}`}
    </span>
  );
}

/** Last 7 days of the headline cost: today's value, the line with the alert
 * line dashed and days over it in red, and each day's cost in tiny type
 * under its point. */
function CostSpark({ days, alert, source, className }: { days: CostDay[]; alert: number | null; source: CostSource; className?: string }) {
  const L = COST_LABEL[source];
  const hot = (d: CostDay) => alert != null && overAlert(d, alert);
  const label = days.map((d) => `${d.date.slice(5)} ${d.cost != null ? usd(d.cost) : d.spend > 0 ? `${usd(d.spend)} spent, 0 ${L.unit}` : "no spend"}`).join(" · ");
  const today = days.at(-1);
  if (!today) return <p className={cn("font-mono text-[11px] text-muted-foreground", className)}>not synced</p>;
  return (
    <div className={cn("min-w-0", className)} title={label}>
      <p className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{L.short} · 7d</span>
        <span className={cn("font-mono", hot(today) && "text-red-600 dark:text-red-400")}>
          today {today.cost != null ? usd(today.cost) : today.spend > 0 ? `0 ${L.unit}` : "—"}
        </span>
      </p>
      <div className="mt-1">
        <Sparkline
          slots
          values={days.map((d) => d.cost)}
          color={CHART.paid}
          alertColor={CHART.red}
          threshold={alert ?? undefined}
          alerts={days.map(hot)}
          label={label}
        />
      </div>
      <div className="mt-0.5 grid font-mono text-[8px] leading-none text-muted-foreground" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <span key={d.date} className={cn("truncate text-center", hot(d) && "font-semibold text-red-600 dark:text-red-400")}>
            {d.cost != null ? d.cost.toFixed(2) : d.spend > 0 ? "0" : "·"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PaidAds({ ads, metrics, posts, status, action, costDays, costAlert, source }: {
  ads: Ad[]; metrics: Map<string, PaidMetrics>; posts: Map<string, Post>;
  /** the headline cost per day, last 7 days, per ad id */
  costDays: Map<string, CostDay[]>;
  /** the cost ceiling to flag; null = no alert */
  costAlert: number | null;
  source: CostSource;
  status: (ad: Ad) => ReactNode; action: (ad: Ad) => ReactNode;
}) {
  const L = COST_LABEL[source];
  const app = source === "appstack";
  const headline = (m: PaidMetrics) => {
    const r = paidRates(m);
    return app ? { value: money(r.appCpi), sub: `${count(m.installs)} installs` } : { value: money(r.costResult), sub: `${count(m.results)} results` };
  };
  const identity = (a: Ad) => {
    const thumb = a.thumbnailUrl || (a.sourcePostId ? posts.get(a.sourcePostId)?.thumbnailUrl : null);
    return <div className="flex min-w-0 items-start gap-2.5">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
      ) : <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border"><ImageOff className="size-4 text-muted-foreground" /></div>}
      <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-snug">{a.name}{a.previewUrl && <a href={a.previewUrl} target="_blank" rel="noreferrer" aria-label={`Preview ${a.name}`} className="ml-1 inline-flex text-muted-foreground"><ExternalLink className="size-3" /></a>}</p><div className="mt-1 flex flex-wrap items-center gap-2">{status(a)}<CostAlertChip days={costDays.get(a.id) ?? []} alert={costAlert} source={source} /></div></div>
      {action(a)}
    </div>;
  };
  return <>
    <div className="divide-y md:hidden">{ads.map((a) => {
      const m = metrics.get(a.id)!; const r = paidRates(m); const h = headline(m);
      const cells = app
        ? [["Spend", money(m.spend)], ["Installs", count(m.installs)], ["CPM", money(r.cpm)], ["CTR", percent(r.ctr)], ["Cost / trial", money(r.costTrial)]]
        : [["Spend", money(m.spend)], ["Results", count(m.results)], ["CPM", money(r.cpm)], ["CTR", percent(r.ctr)]];
      return <article key={a.id} aria-label={`Ad: ${a.name}`} className="space-y-3 p-3">
        {identity(a)}
        <dl className={cn("grid gap-2", app ? "grid-cols-5" : "grid-cols-4")}>{cells.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate font-mono text-sm font-semibold">{value}</dd></div>)}</dl>
        {/* (Event ROAS ·) cost over 7 days · headline cost, left to right */}
        <div className="flex items-start gap-3">
          {app && <div className="shrink-0"><p className="text-[10px] text-muted-foreground">Event ROAS</p><p className="mt-0.5 font-mono text-sm font-semibold">{multiple(r.eventRoas)}</p></div>}
          <CostSpark days={costDays.get(a.id) ?? []} alert={costAlert} source={source} className="flex-1" />
          <div className="-m-1 shrink-0 rounded-md bg-primary/10 p-1 text-right text-primary"><p className="text-[10px] text-muted-foreground">{L.long}</p><p className="mt-0.5 font-mono text-sm font-semibold">{h.value}</p></div>
        </div>
      </article>;
    })}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[860px] text-xs"><thead><tr className="border-y bg-secondary/30 text-left text-[10px] text-muted-foreground">
      <th className="w-72 px-4 py-2 font-medium">Ad</th><th className="p-2 text-right font-medium">Spend</th><th className="p-2 text-right font-medium">CPM</th><th className="p-2 text-right font-medium">CTR</th>
      {app ? <><th className="p-2 text-right font-medium">Cost / trial</th><th className="p-2 text-right font-medium">Event ROAS</th></> : <th className="p-2 text-right font-medium">Results</th>}
      <th className="w-56 p-2 font-medium">{L.short} · last 7d</th><th className="p-2 pr-4 text-right font-medium text-primary">{L.long}</th>
    </tr></thead><tbody className="divide-y">{ads.map((a) => {
      const m = metrics.get(a.id)!; const r = paidRates(m); const h = headline(m);
      return <tr key={a.id}><td className="px-4 py-3">{identity(a)}</td><td className="p-2 text-right font-mono">{money(m.spend)}</td><td className="p-2 text-right font-mono">{money(r.cpm)}</td><td className="p-2 text-right font-mono">{percent(r.ctr)}</td>
        {app ? <>
          <td className="p-2 text-right"><p className="font-mono">{money(r.costTrial)}</p><p className="mt-1 text-[10px] text-muted-foreground">{count(m.trials)} trials</p></td>
          <td className="p-2 text-right font-mono">{multiple(r.eventRoas)}</td>
        </> : <td className="p-2 text-right font-mono" title={a.resultsLabel ?? undefined}>{count(m.results)}</td>}
        <td className="p-2 align-middle"><CostSpark days={costDays.get(a.id) ?? []} alert={costAlert} source={source} /></td>
        <td className="bg-primary/5 p-2 pr-4 text-right"><p className="font-mono font-semibold text-primary">{h.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{h.sub}</p></td>
      </tr>;
    })}</tbody></table></div>
  </>;
}
