import { metaInstallMetrics } from "@/lib/meta-installs";
import { authorized, supaConfigured, supaJson } from "@/lib/server";
import { emptySnapshot, type Connector, type Snapshot } from "@/lib/types";
import { DEMO, demoSnapshot } from "@/lib/demo";
import registry from "@/lib/generated/registry.json";

export const dynamic = "force-dynamic";

/**
 * The live Snapshot, straight from Supabase. Tables no sync has filled
 * yet come back as empty arrays — the app renders empty states, never a
 * made-up number. `configured: false` only means Supabase env is missing.
 */
export async function GET(req: Request) {
  // Demo mode: invented sample data, no password (lib/demo.ts).
  if (DEMO) return Response.json({ configured: true, snapshot: demoSnapshot((registry as { connectors: Connector[] }).connectors) });
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ configured: false });

  try {
    type PostRow = {
      id: string; date: string; account_id: string; title: string; caption: string | null; url: string;
      thumbnail_url: string | null; format: string; boosted: boolean; promotable: boolean | null; promotable_reason: string | null; daily_budget: number | null;
      views: number | null; likes: number | null; comments: number | null; shares: number | null; synced_at: string | null;
      reach: number | null; saves: number | null; interactions: number | null; ig_media_id: string | null;
    };
    type CampaignRow = {
      id: string; channel: string; name: string; objective: string | null; status: string; effective_status: string | null;
      daily_budget: number | null; lifetime_spend: number; created_at: string | null; synced_at: string; archived: boolean;
    };
    type AdRow = {
      id: string; channel: string; campaign_id: string | null; adset_id: string | null; adset_name: string | null; name: string;
      status: string; effective_status: string | null; source_post_id: string | null; preview_url: string | null;
      thumbnail_url: string | null; created_at: string | null; spend: number; impressions: number; reach: number; clicks: number;
      link_clicks: number; results: number; results_label: string | null; synced_at: string;
      installs: number; trials: number; purchases: number; attribution_synced_at: string | null;
    };
    type AdSetRow = {
      id: string; channel: string; campaign_id: string | null; name: string; status: string; effective_status: string | null;
      daily_budget: number | null; optimization_goal: string | null; promoted_pixel_id: string | null; promoted_event: string | null;
      publisher_platforms: string[] | null; device_platforms: string[] | null; user_os: string[] | null; created_at: string | null;
    };
    type DailyAd = { date: string; ad_id: string; spend: number; impressions: number; clicks: number; link_clicks: number; results: number };
    const [accounts, posts, postMetrics, acctMetrics, connectors, campaignRows, adRows, dailyAds, adsetRows, metaInsights, appstackCache, metaDailyRaw] = await Promise.all([
      supaJson<{ id: string; platform: string; handle: string; label: string; kind: string }[]>("accounts?select=*&order=id"),
      // PostgREST caps each response at 1,000 rows. Page explicitly so older
      // posts aren't silently omitted.
      Promise.all([0, 1000, 2000].map((offset) =>
        supaJson<PostRow[]>(`posts?select=*&order=date.desc,id.asc&limit=1000&offset=${offset}`)
      )).then((pages) => pages.flat()),
      supaJson<{ date: string; post_id: string; organic_views: number; paid_views: number; spend: number; installs: number; paid_installs: number }[]>(
        "daily_post_metrics?select=*&order=date.desc&limit=8000"
      ),
      supaJson<{ date: string; account_id: string; followers: number }[]>(
        "daily_account_metrics?select=*&order=date.desc&limit=1000"
      ),
      supaJson<{ key: string; name: string; role: string; status: string; summary: string; unlocks: string; needs: string }[]>(
        "connectors?select=*&order=key"
      ),
      supaJson<CampaignRow[]>("campaigns?select=*&order=created_at.desc&limit=200"),
      supaJson<AdRow[]>("ads?select=*&order=spend.desc&limit=500"),
      supaJson<DailyAd[]>("daily_ad_metrics?select=*&order=date.desc&limit=6000"),
      supaJson<AdSetRow[]>("adsets?select=*&order=name&limit=500"),
      supaJson<{ entity_id: string; pulled_at: string; payload: Record<string, unknown> }[]>("meta_raw?select=entity_id,pulled_at,payload&level=eq.insight&order=pulled_at.desc&limit=1000"),
      // Optional: only filled when the AppStack connector is wired.
      supaJson<{ payload: Snapshot["appstackReport"] }[]>("appstack_cache?id=eq.default&select=payload"),
      supaJson<{ entity_id: string; pulled_at: string; payload: Record<string, unknown> }[]>("meta_daily_insights?select=entity_id,pulled_at,payload&order=pulled_at.desc&limit=6000"),
    ]);

    const rawDaily = new Map(metaDailyRaw.map((r) => [r.entity_id, r]));
    const metaAdIds = new Set(adRows.filter((a) => a.channel === "meta").map((a) => a.id));
    const metaAdDays = dailyAds.filter((d) => metaAdIds.has(d.ad_id)).map((d) => ({
      adId: d.ad_id, date: d.date, spend: Number(d.spend), impressions: Number(d.impressions), clicks: Number(d.clicks), results: Number(d.results ?? 0),
      ...metaInstallMetrics(rawDaily.get(`${d.ad_id}:${d.date}`)?.payload ?? {}),
    }));

    // First row per ad is the latest snapshot. Never fall back to older
    // nonzero conversions if the current pull reports unavailable.
    const report = appstackCache[0]?.payload;
    const appAd = new Map<string, { installs: number; trials: number; purchases: number; spend: number }>();
    for (const row of report?.ads ?? []) {
      if (!row.adId) continue;
      const prev = appAd.get(row.adId) ?? { installs: 0, trials: 0, purchases: 0, spend: 0 };
      appAd.set(row.adId, { installs: prev.installs + row.installs, trials: prev.trials + row.trials, purchases: prev.purchases + row.purchases, spend: prev.spend + row.spend });
    }
    const covered = (a: AdRow) => !!report && !!a.created_at && a.created_at.slice(0, 10) >= report.from && a.created_at.slice(0, 10) <= report.to && ["meta", "apple"].includes(a.channel);
    const latestMeta = new Map<string, (typeof metaInsights)[number]>();
    for (const row of metaInsights) if (!latestMeta.has(row.entity_id)) latestMeta.set(row.entity_id, row);
    // Paid side per post: lifetime over the rows we fetched (a boost's spend
    // is a lifetime number, not a 30-day one).
    const postTotals = new Map<string, { paidViews: number; spend: number; installs: number; paidInstalls: number }>();
    for (const m of postMetrics) {
      const t = postTotals.get(m.post_id) ?? { paidViews: 0, spend: 0, installs: 0, paidInstalls: 0 };
      t.paidViews += m.paid_views ?? 0;
      t.spend += Number(m.spend ?? 0);
      t.installs += m.installs ?? 0;
      t.paidInstalls += m.paid_installs ?? 0;
      postTotals.set(m.post_id, t);
    }

    const followerSeries = new Map<string, { date: string; followers: number }[]>();
    for (const m of acctMetrics) {
      if (!followerSeries.has(m.account_id)) followerSeries.set(m.account_id, []);
      followerSeries.get(m.account_id)!.push({ date: m.date, followers: m.followers });
    }

    const base = emptySnapshot();
    const snapshot: Snapshot = {
      ...base,
      metaAdDays,
      appstackReport: appstackCache[0]?.payload ?? null,
      postsSyncedAt: posts.reduce<string | null>((m, p) => (p.synced_at && (!m || p.synced_at > m) ? p.synced_at : m), null),
      adsSyncedAt: adRows.reduce<string | null>((m, a) => (a.synced_at && (!m || a.synced_at > m) ? a.synced_at : m), null),
      posts: posts.map((p) => {
        const t = postTotals.get(p.id) ?? { paidViews: 0, spend: 0, installs: 0, paidInstalls: 0 };
        return {
          id: p.id,
          date: p.date,
          accountId: p.account_id,
          title: p.title,
          caption: p.caption ?? undefined,
          url: p.url,
          thumbnailUrl: p.thumbnail_url,
          format: p.format,
          boosted: p.boosted,
          promotable: p.promotable !== false,
          promotableReason: p.promotable_reason ?? null,
          dailyBudget: p.daily_budget == null ? null : Number(p.daily_budget),
          organicViews: p.views ?? 0,
          likes: p.likes ?? 0,
          comments: p.comments ?? 0,
          shares: p.shares ?? 0,
          reach: p.reach ?? 0,
          saves: p.saves ?? 0,
          interactions: p.interactions ?? 0,
          igMediaId: p.ig_media_id,
          paidViews: t.paidViews,
          spend: +t.spend.toFixed(2),
          installs: t.installs,
          paidInstalls: t.paidInstalls,
        };
      }),
      campaigns: campaignRows.map((c) => ({
        id: c.id,
        channel: c.channel as Snapshot["campaigns"][number]["channel"],
        name: c.name,
        objective: c.objective,
        status: c.status,
        effectiveStatus: c.effective_status,
        dailyBudget: c.daily_budget == null ? null : Number(c.daily_budget),
        lifetimeSpend: Number(c.lifetime_spend ?? 0),
        createdAt: c.created_at,
        adCount: adRows.filter((a) => a.campaign_id === c.id).length,
        archived: c.archived ?? false,
      })),
      ads: adRows.map((a) => ({
        id: a.id,
        channel: a.channel as Snapshot["ads"][number]["channel"],
        campaignId: a.campaign_id,
        campaignName: campaignRows.find((c) => c.id === a.campaign_id)?.name ?? null,
        adsetId: a.adset_id,
        adsetName: a.adset_name,
        name: a.name,
        status: a.status,
        effectiveStatus: a.effective_status,
        sourcePostId: a.source_post_id,
        previewUrl: a.preview_url,
        thumbnailUrl: a.thumbnail_url,
        createdAt: a.created_at,
        spend: Number(a.spend ?? 0),
        impressions: a.impressions ?? 0,
        reach: a.reach ?? 0,
        clicks: a.clicks ?? 0,
        linkClicks: a.link_clicks ?? 0,
        ...metaInstallMetrics(latestMeta.get(a.id)?.payload ?? {}),
        metaInstallsSyncedAt: latestMeta.get(a.id)?.pulled_at ?? null,
        results: a.results ?? 0,
        resultsLabel: a.results_label,
        appstackSpend: covered(a) ? appAd.get(a.id)?.spend ?? 0 : null,
        installs: covered(a) ? appAd.get(a.id)?.installs ?? 0 : a.installs ?? 0,
        trials: covered(a) ? appAd.get(a.id)?.trials ?? 0 : a.trials ?? 0,
        purchases: covered(a) ? appAd.get(a.id)?.purchases ?? 0 : a.purchases ?? 0,
        attributionSyncedAt: covered(a) ? report!.syncedAt : a.attribution_synced_at ?? null,
      })),
      adsets: adsetRows.map((g) => ({
        id: g.id,
        channel: g.channel as Snapshot["ads"][number]["channel"],
        campaignId: g.campaign_id,
        campaignName: campaignRows.find((c) => c.id === g.campaign_id)?.name ?? null,
        name: g.name,
        status: g.status,
        effectiveStatus: g.effective_status,
        dailyBudget: g.daily_budget == null ? null : Number(g.daily_budget),
        optimizationGoal: g.optimization_goal,
        promotedPixelId: g.promoted_pixel_id,
        promotedEvent: g.promoted_event,
        publisherPlatforms: g.publisher_platforms,
        devicePlatforms: g.device_platforms,
        userOs: g.user_os,
        createdAt: g.created_at,
      })),
      accounts: accounts.map((a) => {
        const hist = (followerSeries.get(a.id) ?? []).sort((x, y) => (x.date < y.date ? -1 : 1));
        const latest = hist.at(-1)?.followers ?? 0;
        const weekAgo = hist.at(-8)?.followers ?? hist[0]?.followers ?? 0;
        return {
          id: a.id,
          platform: a.platform as Snapshot["accounts"][number]["platform"],
          handle: a.handle,
          label: a.label,
          kind: a.kind as "personal" | "brand",
          followers: latest,
          followersDelta7d: latest - weekAgo,
          sparkline: hist.slice(-14).map((h) => h.followers),
        };
      }),
      connectors: connectors.map((c) => ({ ...c, status: c.status as Snapshot["connectors"][number]["status"] })),
    };

    return Response.json({ configured: true, snapshot });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message : "supabase error" }, { status: 502 });
  }
}
