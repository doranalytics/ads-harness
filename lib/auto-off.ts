// Auto-off: every ad gets a full 7 days. After that, enabled daily automation adds up
// its last 7 days and pauses it when the cost is over the limit set on the
// Paid tab. The cost is the same one the 7-day line draws (lib/cost.ts).
// A paused ad someone turns back on gets a fresh 7 days before it is
// judged again. Off until switched on; every pause is logged.
import { CYCLE_DAYS, costByDay, cycleCost, overCycle } from "./cost";
import { graph, readMetaCreds } from "./meta";
import { supa, supaJson, supaAll, metaWritesEnabled } from "./server";
import type { AutoOffEvent, AutoOffRule, Snapshot } from "./types";

export const AUTO_OFF_MIGRATION = "Apply migrations 0002 and 0003 in Supabase (SQL Editor) first.";

export interface AutoOffReport {
  /** false when the rule is off, has no limit, or Meta isn't connected */
  ran: boolean;
  checked: number;
  paused: AutoOffEvent[];
  errors: string[];
}

type RuleRow = { enabled: boolean; cost_limit: number | null };
type LogRow = { ad_id: string; ad_name: string; paused_at: string; spend: number; results: number; cost: number | null; cost_limit: number };

/** The rule and its log. A database without the 0002 migration reads as off. */
export async function readAutoOff(): Promise<{ rule: AutoOffRule; log: AutoOffEvent[] }> {
  const [rules, log] = await Promise.all([
    supaJson<RuleRow[]>("auto_off?id=eq.default&select=enabled,cost_limit").catch(() => []),
    supaJson<LogRow[]>("auto_off_log?select=ad_id,ad_name,paused_at,spend,results,cost,cost_limit&order=paused_at.desc&limit=500").catch(() => []),
  ]);
  const r = rules[0];
  return {
    rule: { enabled: !!r?.enabled, limit: r?.cost_limit == null ? null : Number(r.cost_limit) },
    log: log.map((l) => ({
      adId: l.ad_id, adName: l.ad_name, at: l.paused_at, spend: Number(l.spend), count: l.results,
      cost: l.cost == null ? null : Number(l.cost), limit: Number(l.cost_limit),
    })),
  };
}

export async function runAutoOff(): Promise<AutoOffReport> {
  const report: AutoOffReport = { ran: false, checked: 0, paused: [], errors: [] };
  if (!metaWritesEnabled()) return report;
  const { rule, log } = await readAutoOff();
  if (!rule.enabled || rule.limit == null || !(rule.limit > 0)) return report;
  const creds = await readMetaCreds();
  if (!creds) return report;
  report.ran = true;

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - CYCLE_DAYS * 86400000).toISOString().slice(0, 10);
  const [ads, daily, appstack] = await Promise.all([
    // Switched on and actually delivering: an ad under a paused campaign or
    // ad set isn't spending, so there is nothing to turn off.
    supaAll<{ id: string; name: string; created_at: string | null; auto_off_started_at: string | null; synced_at: string }>("ads?select=id,name,created_at,auto_off_started_at,synced_at&channel=eq.meta&status=eq.ACTIVE&effective_status=eq.ACTIVE&order=id.asc"),
    supaAll<{ date: string; ad_id: string; spend: number; results: number | null }>(`daily_ad_metrics?select=date,ad_id,spend,results&date=gte.${since}&date=lt.${today}&order=date.desc,ad_id.asc`),
    supaJson<{ payload: Snapshot["appstackReport"] }[]>("appstack_cache?id=eq.default&select=payload").catch(() => []),
  ]);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const appReport = appstack[0]?.payload ?? null;
  if (appReport && (appReport.from > since || appReport.to < end || !Number.isFinite(Date.parse(appReport.syncedAt)) || Date.now() - Date.parse(appReport.syncedAt) > 2 * 86400000)) {
    report.errors.push("AppStack does not cover the complete recent seven-day window; auto-off skipped.");
    return report;
  }
  const data = {
    appstackReport: appReport ? { ...appReport, to: end, ads: appReport.ads.filter((r) => r.date >= since && r.date <= end) } : null,
    metaAdDays: daily.map((d) => ({ adId: d.ad_id, date: d.date, spend: Number(d.spend), impressions: 0, clicks: 0, results: Number(d.results ?? 0), metaInstalls: null, metaInstallSpend: null })),
  };
  const lastOff = new Map<string, string>();
  for (const e of log) if (!lastOff.has(e.adId)) lastOff.set(e.adId, e.at);
  const cutoff = Date.now() - CYCLE_DAYS * 86400000;

  for (const ad of ads) {
    // The cycle starts when the ad was created, or when auto-off last paused it.
    const start = [ad.created_at, ad.auto_off_started_at, lastOff.get(ad.id)].filter(Boolean).sort().at(-1);
    if (!start || !Number.isFinite(Date.parse(start)) || Date.parse(start) > cutoff) continue;
    if (!Number.isFinite(Date.parse(ad.synced_at)) || Date.now() - Date.parse(ad.synced_at) > 2 * 3600000) continue;
    if (daily.some((d) => d.ad_id === ad.id && (d.results == null || !Number.isFinite(Number(d.results)) || !Number.isFinite(Number(d.spend))))) continue;
    // Anchor every judgment to yesterday, even when an ad had no activity then.
    const window = { ...data, metaAdDays: [...data.metaAdDays, { adId: "__window_end__", date: end, spend: 0, impressions: 0, clicks: 0, results: 0, metaInstalls: null, metaInstallSpend: null }] };
    report.checked++;
    const c = cycleCost(costByDay(window, new Set([ad.id]), CYCLE_DAYS));
    if (!overCycle(c, rule.limit)) continue;
    try {
      await graph(creds.token, ad.id, { method: "POST", params: { status: "PAUSED" } });
      const at = new Date().toISOString();
      const update = await supa(`ads?id=eq.${ad.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "PAUSED", effective_status: "PAUSED", synced_at: at }) });
      const event: AutoOffEvent = { adId: ad.id, adName: ad.name, at, spend: +c.spend.toFixed(2), count: c.count, cost: c.cost == null ? null : +c.cost.toFixed(2), limit: rule.limit };
      const saved = await supa("auto_off_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ad_id: event.adId, ad_name: event.adName, paused_at: at, spend: event.spend, results: event.count, cost: event.cost, cost_limit: event.limit }) });
      report.paused.push(event);
      if (!update.ok || !saved.ok) report.errors.push(`${ad.name}: paused on Meta, but database status/log could not be fully saved. Check Ads Manager.`);
    } catch (err) {
      report.errors.push(`${ad.name}: ${err instanceof Error ? err.message : "pause failed"}`);
    }
  }
  return report;
}
