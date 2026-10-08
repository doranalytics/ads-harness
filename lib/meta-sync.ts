// Meta paid sync. Read-only against the Marketing API with the System User
// token from Settings → Connector keys → Meta Ads: raw objects appended to
// meta_raw, rollups upserted into campaigns / adsets / ads /
// daily_ad_metrics. Runs daily (vercel.json) and from "Sync now".
// Optional AppStack columns (installs / trials / purchases) are never
// touched here. A field Meta omits stays NULL or 0 — nothing is invented.
import { graph, readMetaCreds, type MetaCreds } from "@/lib/meta";
import { supa, supaJson, supaAll } from "@/lib/server";

export class MetaSyncError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export interface MetaSyncReport {
  syncedAt: string; from: string; to: string;
  campaigns: number; adsets: number; ads: number; dailyRows: number; archived: number;
  statusChanges: { id: string; name: string; from: string | null; to: string | null }[];
}

type Json = Record<string, unknown>;
// "Results" = the first of these Meta reports for the ad: sales first, then
// leads and sign-ups, then app installs, then link clicks as the floor.
// Reorder if your business counts something else first.
const RESULT_ORDER = [
  "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase",
  "lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped",
  "complete_registration", "offsite_conversion.fb_pixel_complete_registration",
  "mobile_app_install", "omni_app_install", "app_install",
  "link_click",
];
const ALL_STATUSES = ["ACTIVE", "PAUSED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"];
const INSIGHT_FIELDS = "spend,impressions,reach,clicks,inline_link_clicks,actions,ctr,cpm";

const minor = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v)) / 100); // budgets arrive in cents
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function results(payload: Json): { results: number; label: string | null } {
  const actions = Array.isArray(payload.actions) ? (payload.actions as { action_type?: string; value?: unknown }[]) : [];
  for (const type of RESULT_ORDER) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return { results: Math.round(num(hit.value)), label: type };
  }
  return { results: 0, label: null };
}

/** Walks Graph paging until the last page. */
async function all(creds: MetaCreds, path: string, params: Record<string, string>): Promise<Json[]> {
  const rows: Json[] = [];
  let next: { path: string; params: Record<string, string> } | null = { path, params: { ...params, limit: params.limit ?? "200" } };
  for (let page = 0; page < 50 && next; page++) {
    const res = await graph(creds.token, next.path, { params: next.params });
    rows.push(...(((res.data as Json[] | undefined) ?? [])));
    const after = (res.paging as { cursors?: { after?: string }; next?: string } | undefined);
    next = after?.next && after.cursors?.after ? { path, params: { ...params, limit: params.limit ?? "200", after: after.cursors.after } } : null;
  }
  if (next) throw new MetaSyncError("Meta paging exceeded the safe limit; sync stopped before judging incomplete data.", 502);
  return rows;
}

async function upsert(table: string, rows: Json[], onConflict?: string): Promise<void> {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const res = await supa(`${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new MetaSyncError(`${table} upsert failed: ${res.status} ${(await res.text()).slice(0, 200)}`, 502);
  }
}

async function landRaw(rows: { level: string; entity_id: string; payload: Json }[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const res = await supa("meta_raw", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!res.ok) throw new MetaSyncError(`meta_raw insert failed: ${res.status}`, 502);
  }
}

async function noteConnector(patch: Json): Promise<void> {
  await supa("connectors?key=eq.meta-ads", { method: "PATCH", body: JSON.stringify(patch) }).catch(() => undefined);
}

export async function syncMeta(days = 14): Promise<MetaSyncReport> {
  const creds = await readMetaCreds();
  if (!creds) {
    await noteConnector({ needs: "Settings → Connector keys → Meta Ads: access token + ad account id (docs/meta-business-setup.md)" });
    throw new MetaSyncError("Meta isn't connected. Settings → Connector keys → Meta Ads.", 409);
  }
  const span = Math.max(1, Math.min(90, Math.floor(days)));
  const to = iso(new Date());
  const from = iso(new Date(Date.now() - (span - 1) * 86400000));
  const syncedAt = new Date().toISOString();
  const act = creds.adAccount;
  const statusFilter = JSON.stringify(ALL_STATUSES);

  try {
    const [campaigns, adsets, ads] = await Promise.all([
      all(creds, `${act}/campaigns`, { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time", effective_status: statusFilter }),
      all(creds, `${act}/adsets`, { fields: "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,promoted_object,created_time,targeting{publisher_platforms,device_platforms,user_os}", effective_status: statusFilter }),
      all(creds, `${act}/ads`, { fields: "id,name,adset_id,campaign_id,status,effective_status,created_time,preview_shareable_link,creative{id,thumbnail_url,instagram_permalink_url,effective_instagram_media_id,source_instagram_media_id,object_story_id}", effective_status: statusFilter }),
    ]);
    const [lifetime, daily, campaignSpend] = await Promise.all([
      all(creds, `${act}/insights`, { level: "ad", date_preset: "maximum", fields: `ad_id,${INSIGHT_FIELDS}`, limit: "500" }),
      all(creds, `${act}/insights`, { level: "ad", time_increment: "1", time_range: JSON.stringify({ since: from, until: to }), fields: `ad_id,date_start,${INSIGHT_FIELDS}`, limit: "500" }),
      all(creds, `${act}/insights`, { level: "campaign", date_preset: "maximum", fields: "campaign_id,spend", limit: "500" }),
    ]);

    // Raw first, append-only, so the rollup can always be rebuilt.
    await landRaw([
      ...campaigns.map((c) => ({ level: "campaign", entity_id: String(c.id), payload: c })),
      ...adsets.map((s) => ({ level: "adset", entity_id: String(s.id), payload: s })),
      ...ads.map((a) => ({ level: "ad", entity_id: String(a.id), payload: a })),
      ...lifetime.map((r) => ({ level: "insight", entity_id: String(r.ad_id), payload: r })),
      ...daily.map((r) => ({ level: "insight_daily", entity_id: `${r.ad_id}:${r.date_start}`, payload: r })),
    ]);

    const spendByCampaign = new Map(campaignSpend.map((r) => [String(r.campaign_id), num(r.spend)]));
    await upsert("campaigns", campaigns.map((c) => ({
      id: String(c.id), channel: "meta", name: String(c.name ?? c.id), objective: c.objective ?? null, status: String(c.status ?? "UNKNOWN"),
      effective_status: c.effective_status == null ? null : String(c.effective_status), daily_budget: minor(c.daily_budget), lifetime_spend: spendByCampaign.get(String(c.id)) ?? 0,
      created_at: c.created_time ?? null, synced_at: syncedAt,
    })));

    await upsert("adsets", adsets.map((s) => {
      const promoted = (s.promoted_object ?? {}) as { pixel_id?: string; custom_event_type?: string; custom_event_str?: string; application_id?: string };
      const targeting = (s.targeting ?? {}) as { publisher_platforms?: string[]; device_platforms?: string[]; user_os?: string[] };
      return {
        id: String(s.id), channel: "meta", campaign_id: s.campaign_id ? String(s.campaign_id) : null, name: String(s.name ?? s.id),
        status: String(s.status ?? "UNKNOWN"), effective_status: s.effective_status == null ? null : String(s.effective_status),
        daily_budget: minor(s.daily_budget), lifetime_budget: minor(s.lifetime_budget),
        optimization_goal: s.optimization_goal ?? null, billing_event: s.billing_event ?? null,
        promoted_pixel_id: promoted.pixel_id ?? null,
        promoted_event: promoted.custom_event_type === "OTHER" ? promoted.custom_event_str ?? null : promoted.custom_event_type ?? null,
        publisher_platforms: targeting.publisher_platforms ?? null, device_platforms: targeting.device_platforms ?? null, user_os: targeting.user_os ?? null,
        created_at: s.created_time ?? null, synced_at: syncedAt,
      };
    }));

    const existing = await supaAll<{ id: string; name: string; effective_status: string | null }>("ads?select=id,name,effective_status&channel=eq.meta&order=id.asc");
    // Post ↔ ad link. A boosted ad's creative names the ORGANIC post as
    // source_instagram_media_id (its permalink points at Meta's ad copy, so
    // the shortcode route only works for non-boost creatives). Resolve by
    // media id first, then by permalink; when neither resolves, leave the
    // column alone — the promote route already wrote it and the 2026-09-26
    // sync wiped three links by writing null here.
    const postRows = await supaJson<{ id: string; ig_media_id: string | null }[]>("posts?select=id,ig_media_id&limit=5000");
    const postIds = new Set(postRows.map((p) => p.id));
    const postByMedia = new Map(postRows.filter((p) => p.ig_media_id).map((p) => [String(p.ig_media_id), p.id]));
    const adsetName = new Map(adsets.map((s) => [String(s.id), String(s.name ?? "")]));
    const lifetimeByAd = new Map(lifetime.map((r) => [String(r.ad_id), r]));
    const adRows = ads.map((a) => {
      const creative = (a.creative ?? {}) as { thumbnail_url?: string; instagram_permalink_url?: string; source_instagram_media_id?: string };
      const code = creative.instagram_permalink_url?.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\//)?.[1];
      const sourcePost = (creative.source_instagram_media_id && postByMedia.get(String(creative.source_instagram_media_id))) || (code && postIds.has(`ig-${code}`) ? `ig-${code}` : null);
      const ins = lifetimeByAd.get(String(a.id)) ?? {};
      const r = results(ins);
      return {
        id: String(a.id), channel: "meta", campaign_id: a.campaign_id ? String(a.campaign_id) : null, adset_id: a.adset_id ? String(a.adset_id) : null,
        adset_name: a.adset_id ? adsetName.get(String(a.adset_id)) ?? null : null, name: String(a.name ?? a.id),
        status: String(a.status ?? "UNKNOWN"), effective_status: a.effective_status == null ? null : String(a.effective_status),
        source_post_id: sourcePost,
        preview_url: a.preview_shareable_link ?? null, thumbnail_url: creative.thumbnail_url ?? null, created_at: a.created_time ?? null,
        spend: num(ins.spend), impressions: Math.round(num(ins.impressions)), reach: Math.round(num(ins.reach)), clicks: Math.round(num(ins.clicks)),
        link_clicks: Math.round(num(ins.inline_link_clicks)), results: r.results, results_label: r.label, synced_at: syncedAt,
      };
    });
    // PostgREST bulk upserts need identical keys per row, so split: rows with a
    // resolved post link carry source_post_id; the rest omit it so an existing
    // link written by the promote route is never nulled.
    await upsert("ads", adRows.filter((a) => a.source_post_id));
    await upsert("ads", adRows.filter((a) => !a.source_post_id).map((row) => { const rest: Json = { ...row }; delete rest.source_post_id; return rest; }));

    const known = new Set(adRows.map((a) => a.id));
    const dailyRows = daily.filter((r) => known.has(String(r.ad_id))).map((r) => {
      const x = results(r);
      return { date: String(r.date_start), ad_id: String(r.ad_id), spend: num(r.spend), impressions: Math.round(num(r.impressions)), clicks: Math.round(num(r.clicks)), link_clicks: Math.round(num(r.inline_link_clicks)), results: x.results };
    });
    // Reconcile late corrections. Failure aborts before automation can run.
    const cleared = await supa(`daily_ad_metrics?date=gte.${from}&date=lte.${to}`, { method: "DELETE" });
    if (!cleared.ok) throw new MetaSyncError("Could not reconcile daily reporting; automation skipped.", 502);
    await upsert("daily_ad_metrics", dailyRows, "date,ad_id");

    // Ads Meta no longer returns: keep the row, mark it archived.
    const gone = existing.filter((e) => !known.has(e.id) && e.effective_status !== "ARCHIVED");
    for (const e of gone) await supa(`ads?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ effective_status: "ARCHIVED", synced_at: syncedAt }) });

    const before = new Map(existing.map((e) => [e.id, e.effective_status]));
    const statusChanges = adRows.filter((a) => before.has(a.id) && before.get(a.id) !== a.effective_status).map((a) => ({ id: a.id, name: a.name, from: before.get(a.id) ?? null, to: a.effective_status }));
    // Restarts in Ads Manager also receive a full new seven-day trial.
    for (const change of statusChanges.filter((a) => a.to === "ACTIVE")) {
      const restarted = await supa(`ads?id=eq.${change.id}`, { method: "PATCH", body: JSON.stringify({ auto_off_started_at: syncedAt }) });
      if (!restarted.ok) throw new MetaSyncError("Apply migration 0003 before using auto-off; restart tracking failed.", 502);
    }

    // Owned media ↔ posts. Stamps ig_media_id on every post Meta owns and
    // marks Instagram posts that are on the profile but NOT in the owned
    // list (collab authored elsewhere, or archived) as not promotable, so
    // the Organic tab greys them out before anyone clicks.
    try {
      const igAccounts = (await graph(creds.token, `${act}/instagram_accounts`, { params: { fields: "id,username", limit: "10" } })).data as { id: string; username: string }[] | undefined;
      const ig = igAccounts?.[0];
      if (ig) {
        const owned = new Map<string, string>(); // shortcode -> media id
        let path: string | null = `${ig.id}/media`; let params: Record<string, string> | undefined = { fields: "id,permalink", limit: "100" };
        for (let page = 0; page < 15 && path; page++) {
          const res = await graph(creds.token, path, { params });
          for (const m of ((res.data as { id: string; permalink?: string }[] | undefined) ?? [])) {
            const code = m.permalink?.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\//)?.[1];
            if (code) owned.set(code, String(m.id));
          }
          const next = (res.paging as { next?: string } | undefined)?.next;
          if (!next) break;
          const u = new URL(next); u.searchParams.delete("access_token");
          path = u.pathname.replace(/^\/v\d+\.\d+\//, ""); params = Object.fromEntries(u.searchParams);
        }
        const igPosts = await supaJson<{ id: string; url: string; ig_media_id: string | null; promotable: boolean | null }[]>(`posts?account_id=eq.ig-${ig.username}&select=id,url,ig_media_id,promotable&limit=5000`);
        for (const p of igPosts) {
          const code = p.url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\//)?.[1] ?? p.id.replace(/^ig-/, "");
          const mediaId = owned.get(code);
          if (mediaId && (p.ig_media_id !== mediaId || p.promotable === false)) {
            await supa(`posts?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ig_media_id: mediaId, promotable: true, promotable_reason: null }) });
          } else if (!mediaId && owned.size >= 100 && p.promotable !== false) {
            await supa(`posts?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ promotable: false, promotable_reason: `Not in @${ig.username}'s owned media on Meta — a collab authored by another account, or archived` }) });
          }
        }
      }
    } catch (err) {
      console.error("owned-media resolution skipped:", err instanceof Error ? err.message : err);
    }

    await noteConnector({ status: "wired", needs: "", summary: "Meta Marketing API, synced by the app (daily + Sync now). Campaigns, ad sets, spend, delivery and results per ad." });
    return { syncedAt, from, to, campaigns: campaigns.length, adsets: adsets.length, ads: adRows.length, dailyRows: dailyRows.length, archived: gone.length, statusChanges };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta sync failed";
    await noteConnector({ needs: `Meta sync failed ${syncedAt.slice(0, 16)}Z: ${message.slice(0, 300)}` });
    throw err instanceof MetaSyncError ? err : new MetaSyncError(message, 502);
  }
}
