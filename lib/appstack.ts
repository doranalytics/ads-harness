// OPTIONAL — only for businesses promoting a mobile app. AppStack attributes
// installs, trials and purchases to each Meta ad; with it wired, the Paid tab
// leads with cost per install instead of Meta's cost per result. Without it
// nothing here runs (the sync reports "skipped").
import { supa, supaJson } from "./server";
import type { AppStackReport, AppStackDay } from "./types";

import { lifecycleEvents } from "./appstack-lifecycle";

const ENDPOINT = "https://mcp.appstack.tech/mcp";
const metrics = [...new Set(["total_spend", "impressions", "clicks", "install", "start_trial", "subscribe", "purchase", ...lifecycleEvents.flatMap(([key]) => [key, `${key}_value`])])];

export class AppStackNotConfigured extends Error {}

export async function syncAppStack(): Promise<AppStackReport> {
  const secrets = await supaJson<{ fields: { mcp_key?: string; app_id?: string } }[]>("connector_secrets?connector=eq.appstack&select=fields");
  const key = secrets[0]?.fields.mcp_key;
  // The App Store / Play id AppStack knows your app by.
  const APP_ID = secrets[0]?.fields.app_id?.trim() || process.env.APPSTACK_APP_ID?.trim();
  if (!key || !APP_ID) throw new AppStackNotConfigured("AppStack is not set up (optional): save an MCP key and app id in Settings → Connector keys → AppStack");
  async function tool(name: string, args: Record<string, unknown> = {}) {
    const res = await fetch(ENDPOINT, { method: "POST", signal: AbortSignal.timeout(60_000), headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}`,
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    if (!res.ok) throw new Error(`AppStack ${name}: HTTP ${res.status}`);
    const text = await res.text();
    const messages = text.trim().startsWith("{") ? [JSON.parse(text)] : text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5).trim()));
    const rpc = messages.find((m) => m.id === 1);
    if (!rpc || rpc.error || rpc.result?.isError) throw new Error(`AppStack ${name} failed`);
    const result = rpc.result;
    return result.structuredContent ?? JSON.parse(result.content.find((c: { type: string }) => c.type === "text").text);
  }
  const identity = await tool("whoami");
  if (identity.scope !== "project" || !identity.apps?.some((a: { app_id: string }) => a.app_id === APP_ID)) throw new Error(`AppStack key is not scoped to a project containing app ${APP_ID}`);
  const to = new Date().toISOString().slice(0, 10);
  // 180 days so the Paid tab's default "all time" range stays inside the
  // report (AppStack metrics outside the window read as unknown).
  const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  async function queryWindow(adLevel: boolean, windowFrom: string, windowTo: string): Promise<AppStackDay[]> {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 50000; offset += 500) {
      const result = await tool("query_metrics", {
        app_ids: [APP_ID], measures: metrics.map((m) => `events_view.${m}`),
        dimensions: ["events_view.media_source", ...(adLevel ? ["events_view.ad_name", "events_view.campaign_name"] : [])],
        time_dimension: "events_view.date_day", date_range: [windowFrom, windowTo], granularity: "day", limit: 500, offset,
        ...(adLevel ? { filters: [{ member: "events_view.media_source", operator: "equals", values: ["meta", "apple"] }] } : {}),
      });
      if (!Array.isArray(result.data)) throw new Error("AppStack returned no data array");
      all.push(...result.data);
      if (result.data.length < 500) return all.map((r) => {
        const n = (key: string) => {
          const raw = r[`events_view.${key}`];
          if (raw == null) return 0; // Complete count query: no events, as in AppStack's dashboard.
          const v = Number(raw);
          if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid AppStack ${key}`);
          return v;
        };
        const lifecycle = Object.fromEntries(lifecycleEvents.map(([key]) => {
          const nullable = (field: string) => {
            const raw = r[`events_view.${field}`];
            if (raw == null) return null;
            const value = Number(raw);
            if (!Number.isFinite(value)) throw new Error(`Invalid AppStack ${field}`);
            return value;
          };
          return [key, { count: nullable(key), value: nullable(`${key}_value`) }];
        }));
        const date = String(r["events_view.date_day.day"] ?? r["events_view.date_day"] ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("AppStack returned an invalid date");
        return { lifecycle, date, mediaSource: String(r["events_view.media_source"] ?? "unknown"), ...resolveAd(r), spend: n("total_spend"), impressions: n("impressions"), clicks: n("clicks"), installs: n("install"), trials: n("start_trial"), subscriptions: n("subscribe"), purchases: n("purchase") };
      });
    }
    throw new Error("AppStack row limit reached; incomplete query was not saved");
  }
  // AppStack removed the ad_id / campaign_id dimensions (2026-09: "Unknown dimension 'events_view.ad_id'");
  // only names remain. Resolve them back to Meta ids through the ads / campaigns tables the Meta sync fills.
  type AdRow = { id: string; name: string; campaign_id: string | null; created_at: string | null };
  const [adRows, campaignRows] = await Promise.all([
    supaJson<AdRow[]>("ads?select=id,name,campaign_id,created_at"),
    supaJson<{ id: string; name: string }[]>("campaigns?select=id,name"),
  ]);
  const campaignIdByName = new Map(campaignRows.map((c) => [c.name, c.id]));
  const adsByName = new Map<string, AdRow[]>();
  for (const a of adRows) adsByName.set(a.name, [...(adsByName.get(a.name) ?? []), a]);
  function resolveAd(r: Record<string, unknown>) {
    const adName = r["events_view.ad_name"] == null ? null : String(r["events_view.ad_name"]);
    const campaignName = r["events_view.campaign_name"] == null ? null : String(r["events_view.campaign_name"]);
    const campaignId = campaignName == null ? null : (campaignIdByName.get(campaignName) ?? null);
    const candidates = adName == null ? [] : (adsByName.get(adName) ?? []);
    const inCampaign = campaignId ? candidates.filter((a) => a.campaign_id === campaignId) : candidates;
    // Same name in several ads: prefer the one in the named campaign, then the newest. Unmatched stays null (never guessed).
    const pick = [...(inCampaign.length ? inCampaign : candidates)].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    return { adName, campaignName, adId: pick?.id ?? null, campaignId: campaignId ?? pick?.campaign_id ?? null };
  }
  // AppStack caps each request at 60 inclusive days. Keep the full history,
  // with disjoint windows so boundary days are neither omitted nor doubled.
  async function query(adLevel: boolean): Promise<AppStackDay[]> {
    const rows: AppStackDay[] = [];
    const day = 86400000;
    const end = Date.parse(`${to}T00:00:00Z`);
    for (let start = Date.parse(`${from}T00:00:00Z`); start <= end; start += 60 * day) {
      const windowFrom = new Date(start).toISOString().slice(0, 10);
      const windowTo = new Date(Math.min(start + 59 * day, end)).toISOString().slice(0, 10);
      rows.push(...await queryWindow(adLevel, windowFrom, windowTo));
    }
    return rows;
  }
  const [channels, ads] = await Promise.all([query(false), query(true)]);
  const report: AppStackReport = { from, to, syncedAt: new Date().toISOString(), channels, ads };
  const response = await supa("appstack_cache", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: "default", payload: report, synced_at: report.syncedAt }) });
  if (!response.ok) throw new Error(`Saving AppStack report failed: ${response.status}`);
  const updated = await supa("connectors?key=eq.appstack", { method: "PATCH", body: JSON.stringify({ status: "wired", needs: "", summary: "Automatic project-scoped AppStack MCP sync. Daily channel and ad attribution, matching AppStack reporting dates." }) });
  if (!updated.ok) throw new Error("AppStack data saved, but connector status update failed");
  return report;
}
