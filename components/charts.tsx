"use client";
// House-style hand-rolled SVG charts — one axis per chart, recessive grid,
// crosshair + tooltip, legend with totals. Palette lives in lib/types
// (validated for CVD separation + surface contrast; color follows the
// entity: organic is always cyan, paid always violet).
import { useRef, useState } from "react";

export const fmt = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 10_000
      ? `${Math.round(n / 1000)}k`
      : Math.abs(n) >= 1_000
        ? `${(n / 1000).toFixed(1)}k`
        : `${Math.round(n)}`;

export const fmtMoney = (n: number) => `$${fmt(n)}`;

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function niceMax(v: number) {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * mag) return m * mag;
  return 10 * mag;
}

/* ---------- multi-series line chart with crosshair tooltip ---------- */
export function LineChart({
  days,
  series,
  unit = "views",
  money = false,
}: {
  days: string[];
  series: { name: string; values: number[]; color: string }[];
  unit?: string;
  money?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 920, H = 250, ML = 48, MR = 14, MT = 12, MB = 28;
  const vmax = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const X = (i: number) => ML + (i / Math.max(days.length - 1, 1)) * (W - ML - MR);
  const Y = (v: number) => MT + (1 - v / vmax) * (H - MT - MB);
  const val = (n: number) => (money ? fmtMoney(n) : fmt(n));
  const yticks = [0, vmax / 2, vmax];
  // weekly ticks + the last day, dropping any weekly tick close enough to
  // the last one to collide with it
  const xticks = days.filter((_, i) => (i % 7 === 0 && days.length - 1 - i >= 4) || i === days.length - 1);

  const ranked = [...series].sort(
    (a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0)
  );

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - ML) / (W - ML - MR)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  const hoverRows = hover === null ? [] : ranked.map((s) => ({ name: s.name, v: s.values[hover], color: s.color }));

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.6" />
            <text x={ML - 6} y={Y(t) + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{val(t)}</text>
          </g>
        ))}
        {xticks.map((d) => (
          <text key={d} x={X(days.indexOf(d))} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{fmtDay(d)}</text>
        ))}
        {hover !== null && (
          <line x1={X(hover)} x2={X(hover)} y1={MT} y2={H - MB} stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
          />
        ))}
        {hover !== null && series.map((s) => (
          <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover])} r="3.5" fill={s.color} stroke="var(--background, #fff)" strokeWidth="1.5" />
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute rounded-lg border bg-background px-3 py-2 text-xs shadow-md"
          style={{ left: `${(X(hover) / W) * 100}%`, top: 0, transform: X(hover) > W * 0.6 ? "translateX(-105%)" : "translateX(8px)" }}>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{fmtDay(days[hover])}</div>
          {hoverRows.map((r) => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-[3px]" style={{ background: r.color }} />
              <span>{r.name}</span>
              <span className="ml-auto pl-3 font-mono">{val(r.v)}</span>
            </div>
          ))}
          <div className="mt-1 border-t pt-1 font-mono text-[10px] text-muted-foreground">
            {val(hoverRows.reduce((a, b) => a + b.v, 0))} {unit}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {ranked.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.name}
            <span className="font-mono">{val(s.values.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- stacked daily bars (e.g. installs organic vs paid) ---------- */
export function StackedBars({
  days,
  series,
  unit = "installs",
  money = false,
}: {
  days: string[];
  series: { name: string; values: number[]; color: string }[];
  unit?: string;
  money?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 920, H = 180, ML = 48, MR = 14, MT = 8, MB = 26;
  const val = (n: number) => (money ? fmtMoney(n) : fmt(n));
  const dayTotals = days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const vmax = niceMax(Math.max(1, ...dayTotals));
  const bw = (W - ML - MR) / days.length;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)}>
        <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke="currentColor" className="text-border" />
        <text x={ML - 6} y={MT + 9} textAnchor="end" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{val(vmax)}</text>
        {days.map((d, i) => {
          let yCursor = H - MB;
          return (
            <g key={d} onMouseEnter={() => setHover(i)}>
              {/* invisible full-height hit target — bigger than the mark */}
              <rect x={ML + i * bw} y={MT} width={bw} height={H - MT - MB} fill="transparent" />
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                const h = Math.max((v / vmax) * (H - MT - MB), 2);
                yCursor -= h;
                const seg = <rect key={s.name} x={ML + i * bw + 1} y={yCursor} width={Math.max(bw - 2, 2)} height={h} rx="2" fill={s.color} />;
                yCursor -= 2; // 2px surface gap between stacked segments
                return seg;
              })}
              {((i % 7 === 0 && days.length - 1 - i >= 4) || i === days.length - 1) && (
                <text x={ML + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="11.5" fontFamily="var(--font-geist-mono, monospace)">{fmtDay(d)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute rounded-lg border bg-background px-3 py-2 text-xs shadow-md"
          style={{ left: `${((ML + hover * bw) / W) * 100}%`, top: 0, transform: hover > days.length * 0.6 ? "translateX(-105%)" : "translateX(8px)" }}>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{fmtDay(days[hover])}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-[3px]" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="ml-auto pl-3 font-mono">{val(s.values[hover] ?? 0)}</span>
            </div>
          ))}
          <div className="mt-1 border-t pt-1 font-mono text-[10px] text-muted-foreground">{val(dayTotals[hover])} {unit}</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.name}
            <span className="font-mono">{val(s.values.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- retention cohort heatmap (sequential cyan, light→dark) ---------- */
const RAMP = ["#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2"];

export function CohortGrid({ cohorts }: { cohorts: { week: string; size: number; retention: number[] }[] }) {
  const maxWeeks = Math.max(...cohorts.map((c) => c.retention.length));
  // Week 0 is always 100% — scale the ramp to the week-1+ range so the
  // interesting variation gets the color resolution.
  const later = cohorts.flatMap((c) => c.retention.slice(1));
  const hi = Math.max(1, ...later);
  const cell = (v: number, isFirst: boolean) => {
    const idx = isFirst ? RAMP.length - 1 : Math.min(RAMP.length - 2, Math.floor((v / hi) * (RAMP.length - 1)));
    return { bg: RAMP[idx], ink: idx >= 4 ? "#ffffff" : "#155e75" };
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="pb-1 pr-2 font-medium">Cohort</th>
            <th className="pb-1 pr-2 text-right font-medium">Installs</th>
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} className="pb-1 text-center font-medium">w{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <td className="whitespace-nowrap pr-2 font-mono text-[11px] text-muted-foreground">{fmtDay(c.week)}</td>
              <td className="pr-2 text-right font-mono text-[11px]">{fmt(c.size)}</td>
              {Array.from({ length: maxWeeks }, (_, i) => {
                const v = c.retention[i];
                if (v == null) return <td key={i} className="rounded-[4px] bg-secondary/40" />;
                const { bg, ink } = cell(v, i === 0);
                return (
                  <td key={i} className="rounded-[4px] px-1.5 py-1.5 text-center font-mono text-[11px]" style={{ background: bg, color: ink }}
                    title={`${fmtDay(c.week)} cohort — week ${i}: ${v}% retained of ${c.size} installs`}>
                    {v}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Weekly install cohorts × % still active each week after (Mixpanel-style). Week 0 is the install week.
      </p>
    </div>
  );
}

/* ---------- inline sparkline: one series, gaps where the value is unknown ---------- */
export function Sparkline({ values, color, label, threshold, alertColor, alerts, slots = false }: {
  values: (number | null)[]; color: string; label?: string;
  /** put each point at the centre of an equal slot, so a grid of per-day labels lines up under it */
  slots?: boolean;
  /** dashed reference line, e.g. a CPI ceiling; the y range always includes it */
  threshold?: number;
  alertColor?: string;
  /** indexes to mark in alertColor (defaults to points above the threshold) */
  alerts?: boolean[];
}) {
  const W = 100, H = 24, P = 2.5;
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0 && threshold == null) return null;
  const range = threshold != null ? [...known, threshold] : known;
  const lo = Math.min(...range), hi = Math.max(...range);
  const X = (i: number) =>
    slots ? ((i + 0.5) * W) / values.length : values.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (values.length - 1);
  const Y = (v: number) => (hi === lo ? H / 2 : H - P - ((v - lo) / (hi - lo)) * (H - 2 * P));
  // Break the line at unknown days rather than drawing through them.
  const segs: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v == null) { if (cur) segs.push(cur); cur = ""; return; }
    cur += `${cur ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const last = values.findLastIndex((v) => v != null);
  const hot = (i: number) => (alerts ? alerts[i] : threshold != null && values[i] != null && values[i]! > threshold);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full overflow-visible" role="img" aria-label={label}>
      {label && <title>{label}</title>}
      {threshold != null && (
        <line x1={0} x2={W} y1={Y(threshold)} y2={Y(threshold)} stroke={alertColor ?? "currentColor"} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" vectorEffect="non-scaling-stroke" />
      )}
      {segs.map((d) => <path key={d} d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
      {/* the latest day, any lone day with no neighbour to draw a line to, and every alert day */}
      {values.map((v, i) => {
        const alert = hot(i) && alertColor;
        if (alert && v == null) {
          // over the line with no installs at all: a mark pinned to the top
          return <path key={i} d={`M${X(i).toFixed(1)},0V${(P * 2).toFixed(1)}`} stroke={alertColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
        }
        return v != null && (alert || i === last || (values[i - 1] == null && values[i + 1] == null)) && (
          // a zero-length round-capped stroke stays a circle when the svg stretches
          <path key={i} d={`M${X(i).toFixed(1)},${Y(v).toFixed(1)}h0`} stroke={alert ? alertColor : color} strokeWidth={alert ? 5 : 3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        );
      })}
    </svg>
  );
}
