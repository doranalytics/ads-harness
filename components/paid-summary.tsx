"use client";
import { useState } from "react";
import { CalendarDays, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dayOffset, paidRates, type PaidMetrics, type PaidRange } from "@/lib/paid-report";
import { COST_LABEL, type CostSource } from "@/lib/cost";

export const money = (n: number | null) => n == null ? "—" : `$${n.toFixed(2)}`;
export const count = (n: number | null) => n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const multiple = (n: number | null) => n == null ? "—" : `${n.toFixed(2)}×`;
export const percent = (n: number | null) => n == null ? "—" : `${(n * 100).toFixed(2)}%`;

export type PaidPreset = "all" | "today" | "yesterday" | "7" | "14" | "30" | "60" | "90" | "custom";
export function PaidSummary({ metrics, range, setRange, preset, setPreset, minDate, adsCount, metaSyncedAt, appSyncedAt, source }: {
  metrics: PaidMetrics; range: PaidRange; setRange: (range: PaidRange) => void; preset: PaidPreset; setPreset: (p: PaidPreset) => void; minDate?: string; adsCount: number; metaSyncedAt: string | null; appSyncedAt?: string;
  source: CostSource;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const rates = paidRates(metrics);
  const valid = draft.from && draft.to && draft.from <= draft.to && (!minDate || draft.from >= minDate) && draft.to <= dayOffset(0);
  const app = source === "appstack";
  const L = COST_LABEL[source];
  const stats: [string, string, string?][] = [
    ["Spend", money(metrics.spend)], ["CPM", money(rates.cpm)], ["CTR", percent(rates.ctr)],
    ...(app
      ? ([["Cost / trial", money(rates.costTrial), `${count(metrics.trials)} trials`], ["Event ROAS", multiple(rates.eventRoas)]] as [string, string, string?][])
      : ([["Results", count(metrics.results)]] as [string, string, string?][])),
  ];
  const headline = app ? money(rates.appCpi) : money(rates.costResult);
  const headlineSub = app ? `${count(metrics.installs)} installs · ${L.formula}` : `${count(metrics.results)} results · ${L.formula}`;
  return <section aria-label="Paid performance" className="overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <select aria-label="Performance date range" value={preset} className="h-7 max-w-48 rounded-md bg-transparent text-xs outline-none focus:ring-2 focus:ring-ring" onChange={(e) => {
          const value = e.target.value as PaidPreset; setPreset(value);
          if (value === "all") return; // the page derives the all-time range from the data
          if (value === "today") setRange({ from: dayOffset(0), to: dayOffset(0) });
          else if (value === "yesterday") setRange({ from: dayOffset(-1), to: dayOffset(-1) });
          else if (value !== "custom") setRange({ from: dayOffset(-Number(value)), to: dayOffset(-1) });
        }}>
          <option value="all">All time</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
          {(["7", "14", "30", "60", "90"] as const).map((d) => <option key={d} value={d}>Last {d} full days</option>)}
          {preset === "custom" && <option value="custom">{range.from} – {range.to}</option>}
        </select>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setDraft(range); setCustomOpen(true); }}>Custom</Button>
      </div>
      <div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground">{adsCount} {adsCount === 1 ? "ad" : "ads"}</span><Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label="About these metrics" onClick={() => setInfoOpen(true)}><Info className="size-3.5" /></Button></div>
    </div>
    <dl className={`grid grid-cols-3 gap-x-3 gap-y-4 p-3 sm:p-4 ${app ? "sm:grid-cols-5 lg:grid-cols-7" : "sm:grid-cols-4 lg:grid-cols-6"}`}>
      {stats.map(([label, value, sub]) => <div key={label} className="min-w-0 py-1"><dt className="text-[10px] text-muted-foreground sm:text-xs">{label}</dt><dd className="mt-1 font-mono text-lg font-semibold tracking-tight sm:text-xl">{value}</dd>{sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}</div>)}
      {/* The main KPI: cost per result, or cost per install when AppStack is wired. */}
      <div className={`order-first col-span-3 -m-1 rounded-lg bg-primary/10 p-2 ring-1 ring-primary/20 lg:order-none lg:col-span-2 ${app ? "sm:col-span-5" : "sm:col-span-4"}`}><dt className="text-[10px] font-medium text-primary sm:text-xs">{L.long}</dt><dd className="mt-1 font-mono text-2xl font-bold tracking-tight text-primary sm:text-3xl">{headline}</dd><p className="mt-0.5 text-[10px] text-muted-foreground">{headlineSub}</p></div>
    </dl>
    <Dialog open={customOpen} onOpenChange={setCustomOpen}><DialogContent><DialogTitle>Custom date range</DialogTitle><DialogDescription>Apply these dates to the summary and every ad.</DialogDescription>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs">From<Input aria-label="From date" type="date" min={minDate} max={draft.to} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label><label className="text-xs">To<Input aria-label="To date" type="date" min={draft.from} max={dayOffset(0)} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label></div>
      <Button disabled={!valid} onClick={() => { setRange(draft); setPreset("custom"); setCustomOpen(false); }}>Apply dates</Button>
    </DialogContent></Dialog>
    <Dialog open={infoOpen} onOpenChange={setInfoOpen}><DialogContent><DialogTitle>About these metrics</DialogTitle><DialogDescription>{range.from} – {range.to}. Current ad, campaign and status filters apply throughout.</DialogDescription>
      <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
        <p>Spend, CPM, CTR and results come from Meta’s daily reports. The harness picks the first recognized action: purchase, lead, registration, install, then link click. Check the result label and Ads Manager before comparing ads with different objectives.</p>
        <p>{L.long} is the headline: {L.formula}, for these same ads and dates.</p>
        {app && <p>With AppStack connected, cost per trial is AppStack spend ÷ AppStack START_TRIAL events, and Event ROAS is AppStack PURCHASE event value ÷ AppStack spend (reported event value, not verified cash).</p>}
        <p>Today, Yesterday and quick ranges select calendar dates in your local timezone. Data for those dates follows Meta’s reporting day (your ad account’s timezone). Missing data or a zero denominator displays a dash. Meta syncs daily at 07:15 UTC and whenever you press Sync now.</p>
        <p>Meta synced: {metaSyncedAt ? new Date(metaSyncedAt).toLocaleString() : "Not yet"}{app && <><br />AppStack synced: {appSyncedAt ? new Date(appSyncedAt).toLocaleString() : "Not yet"}</>}</p>
      </div>
    </DialogContent></Dialog>
  </section>;
}
