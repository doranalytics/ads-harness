// The headline paid number, per day and per ad.
//
// Without AppStack (most businesses): cost per result = Meta spend ÷ Meta
// results, where "results" is the event the ad set optimises for —
// purchases, leads, sign-ups (see RESULT_ORDER in lib/meta-sync.ts).
// With AppStack wired (promoting a mobile app): cost per install = AppStack
// spend ÷ AppStack installs, and Meta's own install counts are ignored.
import type { Snapshot } from "./types";

export type CostSource = "meta" | "appstack";

export interface CostDay {
  date: string;
  spend: number;
  /** results (meta) or installs (appstack) that day */
  count: number;
  /** null when there was nothing to divide by (spend alone is not a cost) */
  cost: number | null;
}

export const costSource = (s: Pick<Snapshot, "appstackReport">): CostSource => (s.appstackReport ? "appstack" : "meta");

/** Labels for whichever number is the headline. */
export const COST_LABEL: Record<CostSource, { short: string; long: string; unit: string; formula: string }> = {
  meta: { short: "Cost/result", long: "Cost per result", unit: "results", formula: "Meta spend ÷ Meta results (the event each ad set optimises for)" },
  appstack: { short: "CPI", long: "AppStack CPI", unit: "installs", formula: "AppStack spend ÷ AppStack installs" },
};

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** The last `days` calendar days ending at the newest day the source has,
 * so every ad's line covers the same dates. A day with no row is zero
 * spend and zero count. */
export function costByDay(s: Pick<Snapshot, "appstackReport" | "metaAdDays">, adIds: Set<string>, days = 7): CostDay[] {
  const byDate = new Map<string, { spend: number; count: number }>();
  let end: string | null = null;
  if (s.appstackReport) {
    end = s.appstackReport.to;
    for (const r of s.appstackReport.ads) {
      if (!r.adId || !adIds.has(r.adId)) continue;
      const d = byDate.get(r.date) ?? { spend: 0, count: 0 };
      d.spend += r.spend;
      d.count += r.installs;
      byDate.set(r.date, d);
    }
  } else {
    for (const r of s.metaAdDays) {
      if (!end || r.date > end) end = r.date;
      if (!adIds.has(r.adId)) continue;
      const d = byDate.get(r.date) ?? { spend: 0, count: 0 };
      d.spend += r.spend;
      d.count += r.results;
      byDate.set(r.date, d);
    }
  }
  if (!end) return [];
  return Array.from({ length: days }, (_, i) => {
    const date = shift(end!, i - days + 1);
    const d = byDate.get(date) ?? { spend: 0, count: 0 };
    return { date, ...d, cost: d.count > 0 ? d.spend / d.count : null };
  });
}

/** Over the alert line: a cost above it, or spend past it with nothing to show. */
export const overAlert = (d: CostDay, alert: number) => (d.cost != null ? d.cost > alert : d.spend > alert);
