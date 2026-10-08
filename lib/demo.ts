// Demo mode — NEXT_PUBLIC_DEMO=1. No password, no Supabase, no Meta: the
// app serves this made-up account so you can see every screen. Every
// number and post here is invented, and the header says "demo" the whole
// time. Never turn this on for a real deployment.
import type { Ad, AdSet, Campaign, Connector, MetaAdDay, Post, Snapshot } from "./types";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** Deterministic, so the demo looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

const CAPTIONS: [string, string, string][] = [
  // caption, gradient from, gradient to
  ["The autumn blend is back for six weeks only", "#7c2d12", "#f59e0b"],
  ["How we roast: 14 minutes, one bean at a time", "#1e293b", "#64748b"],
  ["Three brew methods, one bag — which wins?", "#0f766e", "#5eead4"],
  ["Behind the counter on a Saturday rush", "#4c1d95", "#a78bfa"],
  ["Your first subscription box ships free", "#9f1239", "#fb7185"],
  ["Meet the farm in Huila that grows our decaf", "#14532d", "#86efac"],
  ["Cold brew at home in 5 steps", "#0c4a6e", "#38bdf8"],
  ["We tried 9 oat milks so you don't have to", "#78350f", "#fde68a"],
  ["Gift cards are live — no shipping needed", "#831843", "#f9a8d4"],
  ["The grinder setting that fixes sour coffee", "#312e81", "#818cf8"],
  ["New mugs, made by a potter down the street", "#3f3f46", "#d4d4d8"],
  ["Espresso vs. moka pot: the honest test", "#7f1d1d", "#fca5a5"],
  ["Our most-reordered bag, explained", "#365314", "#bef264"],
  ["Latte art fails (and one win)", "#134e4a", "#99f6e4"],
  ["Why fresh beans taste brighter", "#422006", "#fdba74"],
  ["Holiday hours + pre-order dates", "#1e3a8a", "#93c5fd"],
];

/** A 4:5 cover drawn as SVG: a gradient with the caption on it. */
function cover(text: string, from: string, to: string): string {
  const words = text.split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last && (last + " " + w).length <= 15) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tspans = lines.slice(0, 5).map((l, i) => `<tspan x="40" dy="${i ? 42 : 0}">${esc(l)}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="330" cy="90" r="120" fill="#fff" opacity="0.08"/><text y="230" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">${tspans}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function demoSnapshot(connectors: Connector[]): Snapshot {
  const r = rng(7);
  const followers = 12400;
  const posts: Post[] = CAPTIONS.map(([title, from, to], i) => {
    const reel = i % 3 !== 1;
    const views = reel ? Math.round(3000 + r() * 40000) : 0;
    const likes = Math.round((reel ? views * (0.02 + r() * 0.04) : 150 + r() * 600));
    return {
      id: `ig-demo${i}`, date: day(-2 - i * 3), accountId: "ig-yourbrand", title, caption: title,
      url: "https://www.instagram.com/", thumbnailUrl: cover(title, from, to), format: reel ? "reel" : "carousel",
      boosted: false, promotable: i !== 11, promotableReason: i === 11 ? "Meta: this post uses licensed audio and can't run as an ad" : null,
      organicViews: views, likes, comments: Math.round(likes * (0.02 + r() * 0.05)), shares: 0, reach: 0, saves: 0, interactions: 0,
      paidViews: 0, spend: 0, installs: 0, paidInstalls: 0,
    };
  });

  const campaign: Campaign = {
    id: "demo-c1", channel: "meta", name: "Always on · Sales", objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: "ACTIVE",
    dailyBudget: null, lifetimeSpend: 0, createdAt: `${day(-60)}T12:00:00Z`, adCount: 0, archived: false,
  };
  const adset = (id: string, name: string, budget: number, status: string): AdSet => ({
    id, channel: "meta", campaignId: campaign.id, campaignName: campaign.name, name, status, effectiveStatus: status, dailyBudget: budget,
    optimizationGoal: "OFFSITE_CONVERSIONS", promotedPixelId: "demo-pixel", promotedEvent: "PURCHASE",
    publisherPlatforms: ["instagram"], devicePlatforms: ["mobile"], userOs: null, createdAt: campaign.createdAt,
  });
  const adsets = [adset("demo-s1", "Promoted posts", 60, "ACTIVE"), adset("demo-s2", "Retargeting · 30 days", 20, "PAUSED")];

  // Which posts run as ads, where, and how they're doing (cost per sale).
  const placed: { post: number; set: string; status: string; cost: number; drift: number; daily: number }[] = [
    { post: 0, set: "demo-s1", status: "ACTIVE", cost: 6.5, drift: 0.6, daily: 22 },
    { post: 4, set: "demo-s1", status: "ACTIVE", cost: 4.2, drift: -0.2, daily: 18 },
    { post: 2, set: "demo-s1", status: "ACTIVE", cost: 8.8, drift: 0.9, daily: 12 },
    { post: 7, set: "demo-s1", status: "PENDING_REVIEW", cost: 7, drift: 0, daily: 0 },
    { post: 12, set: "demo-s2", status: "PAUSED", cost: 5.1, drift: 0.1, daily: 6 },
    { post: 6, set: "demo-s1", status: "PAUSED", cost: 11.5, drift: 0.3, daily: 9 },
  ];
  const metaAdDays: MetaAdDay[] = [];
  const ads: Ad[] = placed.map((p, i) => {
    const id = `demo-a${i}`;
    let spend = 0, results = 0, impressions = 0, clicks = 0;
    for (let d = -20; d <= 0; d++) {
      const live = p.status === "ACTIVE" || (p.status === "PAUSED" && d < -6);
      if (!live || !p.daily) continue;
      const s = +(p.daily * (0.7 + r() * 0.6)).toFixed(2);
      const cost = p.cost * (1 + (p.drift * (d + 20)) / 20) * (0.75 + r() * 0.5);
      const res = Math.max(0, Math.round(s / cost + (r() - 0.5)));
      const imp = Math.round(s * (70 + r() * 40));
      const clk = Math.round(imp * (0.012 + r() * 0.02));
      metaAdDays.push({ adId: id, date: day(d), spend: s, impressions: imp, clicks: clk, results: res, metaInstalls: null, metaInstallSpend: null });
      spend += s; results += res; impressions += imp; clicks += clk;
    }
    const set = adsets.find((g) => g.id === p.set)!;
    return {
      id, channel: "meta", campaignId: campaign.id, campaignName: campaign.name, adsetId: set.id, adsetName: set.name,
      name: posts[p.post].title, status: p.status === "PENDING_REVIEW" ? "ACTIVE" : p.status, effectiveStatus: p.status,
      sourcePostId: posts[p.post].id, previewUrl: null, thumbnailUrl: null, createdAt: `${day(-21)}T12:00:00Z`,
      spend: +spend.toFixed(2), impressions, reach: Math.round(impressions * 0.7), clicks, linkClicks: Math.round(clicks * 0.8),
      results, resultsLabel: "purchase", metaInstalls: null, metaInstallSpend: null, metaInstallsSyncedAt: null,
      installs: 0, trials: 0, purchases: 0, attributionSyncedAt: null, appstackSpend: null,
    };
  });
  campaign.adCount = ads.length;
  campaign.lifetimeSpend = +ads.reduce((t, a) => t + a.spend, 0).toFixed(2);

  // The demo's auto-off: on at $9, and it turned one ad off six days ago.
  const limit = 9;
  const off = ads[5];
  const judged = metaAdDays.filter((d) => d.adId === off.id && d.date >= day(-13) && d.date <= day(-7));
  const offSpend = +judged.reduce((t, d) => t + d.spend, 0).toFixed(2);
  const offCount = judged.reduce((t, d) => t + d.results, 0);

  const now = new Date().toISOString();
  return {
    metaAdDays, appstackReport: null, postsSyncedAt: now, adsSyncedAt: now,
    posts, campaigns: [campaign], ads, adsets,
    accounts: [{ id: "ig-yourbrand", platform: "instagram", handle: "yourbrand", label: "Your Brand", kind: "brand", followers, followersDelta7d: 180, sparkline: [] }],
    connectors: connectors.map((c) => ({ ...c, status: c.key === "appstack" ? "planned" : "wired", needs: c.key === "appstack" ? c.needs : "" })),
    demo: true, metaWritesEnabled: false,
    autoOff: { enabled: true, limit },
    autoOffLog: [{ adId: off.id, adName: off.name, at: `${day(-6)}T07:15:00Z`, spend: offSpend, count: offCount, cost: offCount > 0 ? +(offSpend / offCount).toFixed(2) : null, limit }],
  };
}
