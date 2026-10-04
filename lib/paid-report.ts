import type { Ad, Snapshot } from "./types";

export type PaidRange = { from: string; to: string };
// Presets are calendar days in the viewer's timezone. UTC midnight must
// not turn "Today" into tomorrow during the afternoon in the Americas.
export const dayOffset = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const ratio = (numerator: number | null, denominator: number | null) => numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
export const nullableSum = (values: (number | null)[]) => values.some((n) => n != null) ? values.reduce<number>((n, v) => n + (v ?? 0), 0) : null;
export interface PaidMetrics {
  spend: number | null; impressions: number | null; clicks: number | null;
  /** Meta results: the event the ad set optimises for */
  results: number | null;
  metaInstalls: number | null; metaInstallSpend: number | null;
  eventRevenue: number | null;
  appSpend: number | null; appClicks: number | null; installs: number | null; trials: number | null; purchases: number | null;
}
export function adPeriodMetrics(snapshot: Snapshot, ad: Ad, range: PaidRange): PaidMetrics {
  const inRange = (r: { date: string }) => r.date >= range.from && r.date <= range.to;
  const meta = (snapshot.metaAdDays ?? []).filter((r) => r.adId === ad.id && inRange(r));
  const knownMeta = meta.filter((r) => r.metaInstalls != null && r.metaInstallSpend != null);
  const report = snapshot.appstackReport;
  const covered = !!report && range.from >= report.from && range.to <= report.to;
  const app = report?.ads.filter((r) => r.adId === ad.id && r.mediaSource === ad.channel && inRange(r)) ?? [];
  const appTotal = (key: "spend" | "clicks" | "installs" | "trials" | "purchases") => covered ? app.reduce((n, r) => n + r[key], 0) : null;
  return {
    spend: ad.channel === "meta" ? nullableSum(meta.map((r) => r.spend)) : appTotal("spend"),
    impressions: ad.channel === "meta" ? nullableSum(meta.map((r) => r.impressions)) : covered ? app.reduce((n, r) => n + r.impressions, 0) : null,
    clicks: ad.channel === "meta" ? nullableSum(meta.map((r) => r.clicks)) : appTotal("clicks"),
    results: ad.channel === "meta" ? nullableSum(meta.map((r) => r.results)) : null,
    metaInstalls: nullableSum(knownMeta.map((r) => r.metaInstalls)),
    metaInstallSpend: nullableSum(knownMeta.map((r) => r.metaInstallSpend)),
    eventRevenue: covered && app.every((r) => r.purchases === 0 || r.lifecycle?.purchase?.value != null)
      ? app.reduce((n, r) => n + (r.lifecycle?.purchase?.value ?? 0), 0) : null,
    appSpend: appTotal("spend"), appClicks: appTotal("clicks"), installs: appTotal("installs"), trials: appTotal("trials"), purchases: appTotal("purchases"),
  };
}
export function sumPaidMetrics(rows: PaidMetrics[]): PaidMetrics {
  const keys: (keyof PaidMetrics)[] = ["spend", "impressions", "clicks", "results", "metaInstalls", "metaInstallSpend", "eventRevenue", "appSpend", "appClicks", "installs", "trials", "purchases"];
  const total = Object.fromEntries(keys.map((key) => [key, nullableSum(rows.map((r) => r[key]))])) as unknown as PaidMetrics;
  if (rows.some((r) => (r.purchases ?? 0) > 0 && r.eventRevenue == null)) total.eventRevenue = null;
  return total;
}
export const paidRates = (m: PaidMetrics) => ({
  cpm: ratio(m.spend == null ? null : m.spend * 1000, m.impressions), ctr: ratio(m.clicks, m.impressions),
  costResult: ratio(m.spend, m.results),
  metaCpi: ratio(m.metaInstallSpend, m.metaInstalls), appCpi: ratio(m.appSpend, m.installs),
  costTrial: ratio(m.appSpend, m.trials), costPurchase: ratio(m.appSpend, m.purchases),
  eventRoas: ratio(m.eventRevenue, m.appSpend),
  trialRate: ratio(m.trials, m.appClicks), purchaseRate: ratio(m.purchases, m.trials),
});
