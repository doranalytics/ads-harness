"use client";
// ROAS or cost per install over time — daily and cumulative, same house
// style as charts.tsx. CPI = AppStack spend ÷ AppStack installs.
// Event ROAS = AppStack PURCHASE event value ÷ AppStack spend (see the Paid
// summary's info dialog): reported values only, not verified cash. A day
// with no spend has no daily ROAS (gap, not zero); cumulative runs from the
// first day with spend.
import { useRef, useState } from "react";
import { CHART } from "@/lib/types";
import { fmtMoney } from "@/components/charts";

const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const x = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);
const usd = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
function niceMax(v: number) {
  if (v <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * mag) return m * mag;
  return 10 * mag;
}

export interface RoasDay { date: string; spend: number; revenue: number | null; installs: number }
export type RoasMetric = "roas" | "cpi";

export function roasSeries(rows: RoasDay[]) {
  let cumSpend = 0, cumRevenue = 0, cumInstalls = 0, unknown = false;
  return rows.map((r) => {
    cumSpend += r.spend;
    cumInstalls += r.installs;
    if (r.revenue == null && r.spend > 0) unknown = true; else cumRevenue += r.revenue ?? 0;
    const daily = r.spend > 0 && r.revenue != null ? r.revenue / r.spend : null;
    const cumulative = cumSpend > 0 && !unknown ? cumRevenue / cumSpend : null;
    const dailyCpi = r.spend > 0 && r.installs > 0 ? r.spend / r.installs : null;
    const cumulativeCpi = cumInstalls > 0 ? cumSpend / cumInstalls : null;
    return { ...r, daily, cumulative, dailyCpi, cumulativeCpi, cumSpend, cumInstalls, cumRevenue: unknown ? null : cumRevenue };
  });
}

export function RoasChart({ rows, metric = "roas" }: { rows: RoasDay[]; metric?: RoasMetric }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const series = roasSeries(rows);
  const days = series.map((s) => s.date);
  const W = 920, H = 220, ML = 44, MR = 14, MT = 12, MB = 28;
  const cpi = metric === "cpi";
  const fmtV = cpi ? usd : x;
  const lines: { name: string; color: string; pick: (s: (typeof series)[number]) => number | null; dash?: string }[] = cpi
    ? [
        { name: "Cumulative CPI", color: CHART.blue, pick: (s) => s.cumulativeCpi },
        { name: "Daily CPI", color: CHART.paid, pick: (s) => s.dailyCpi, dash: "4 3" },
      ]
    : [
        { name: "Cumulative ROAS", color: CHART.blue, pick: (s) => s.cumulative },
        { name: "Daily ROAS", color: CHART.paid, pick: (s) => s.daily, dash: "4 3" },
      ];
  const vmax = niceMax(Math.max(1, ...series.flatMap((s) => lines.map((l) => l.pick(s) ?? 0))));
  const X = (i: number) => ML + (i / Math.max(days.length - 1, 1)) * (W - ML - MR);
  const Y = (v: number) => MT + (1 - v / vmax) * (H - MT - MB);
  const yticks = [0, vmax / 2, vmax];
  const xticks = days.filter((_, i) => (i % 7 === 0 && days.length - 1 - i >= 4) || i === days.length - 1);
  // Gaps where a value is missing: start a new subpath instead of bridging.
  const path = (pick: (s: (typeof series)[number]) => number | null) =>
    series.map((s, i) => { const v = pick(s); if (v == null) return null; return `${i === 0 || pick(series[i - 1]) == null ? "M" : "L"} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; }).filter(Boolean).join(" ");
  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - ML) / (W - ML - MR)) * (days.length - 1)))));
  };
  const last = series[series.length - 1];
  const h = hover == null ? null : series[hover];
  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.6" />
            <text x={ML - 6} y={Y(t) + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{cpi ? `$${t.toFixed(t < 2 ? 1 : 0)}` : `${t.toFixed(t < 2 ? 1 : 0)}×`}</text>
          </g>
        ))}
        {!cpi && vmax > 1 && <line x1={ML} x2={W - MR} y1={Y(1)} y2={Y(1)} stroke={CHART.spend} strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />}
        {xticks.map((d) => (
          <text key={d} x={X(days.indexOf(d))} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{fmtDay(d)}</text>
        ))}
        {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={MT} y2={H - MB} stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="3 3" />}
        {lines.map((l) => <path key={l.name} d={path(l.pick)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeDasharray={l.dash} />)}
        {h && lines.map((l) => { const v = l.pick(h); return v == null ? null : <circle key={l.name} cx={X(hover!)} cy={Y(v)} r="3.5" fill={l.color} stroke="var(--background, #fff)" strokeWidth="1.5" />; })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute rounded-lg border bg-background px-3 py-2 text-xs shadow-md" style={{ left: `${(X(hover!) / W) * 100}%`, top: 0, transform: X(hover!) > W * 0.6 ? "translateX(-105%)" : "translateX(8px)" }}>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{fmtDay(h.date)}</div>
          {lines.map((l) => (
            <div key={l.name} className="flex items-center gap-2"><span className="inline-block size-2 rounded-[3px]" style={{ background: l.color }} />{l.name}<span className="ml-auto pl-3 font-mono">{fmtV(l.pick(h))}</span></div>
          ))}
          <div className="mt-1 border-t pt-1 font-mono text-[10px] text-muted-foreground">
            {cpi
              ? `spend ${fmtMoney(h.spend)} · ${h.installs} installs · to date ${fmtMoney(h.cumSpend)} → ${h.cumInstalls} installs`
              : `spend ${fmtMoney(h.spend)} · value ${h.revenue == null ? "unknown" : fmtMoney(h.revenue)} · to date ${fmtMoney(h.cumSpend)} → ${h.cumRevenue == null ? "unknown" : fmtMoney(h.cumRevenue)}`}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {lines.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: l.color }} />{l.name}
            <span className="font-mono">{fmtV(last ? l.pick(last) : null)}</span>
          </span>
        ))}
        {!cpi && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><span className="inline-block h-0.5 w-3 rounded" style={{ background: CHART.spend }} />break-even 1×</span>}
      </div>
    </div>
  );
}
