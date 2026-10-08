export type Platform = "x" | "instagram" | "tiktok" | "youtube" | "facebook";

export interface Account {
  id: string;
  platform: Platform;
  handle: string;
  label: string;
  kind: "personal" | "brand";
  followers?: number;
  followersDelta7d?: number;
  sparkline?: number[];
}

export interface Post {
  id: string;
  /** YYYY-MM-DD the post went up */
  date: string;
  accountId: string;
  /** First line of the caption — what the card shows */
  title: string;
  caption?: string;
  /** The REAL post url — the card links out to it (we never pull the video) */
  url: string;
  /** Cover image, copied into Supabase storage by the sync (IG CDN urls expire) */
  thumbnailUrl?: string | null;
  format: string;
  boosted: boolean;
  /** false when Meta will not run this post as an ad (collab/archived, or rejected as not eligible) */
  promotable: boolean;
  promotableReason?: string | null;
  /** Current boost budget per day, when boosted */
  dailyBudget?: number | null;
  // --- organic, cumulative as of the last sync ---
  organicViews: number;
  likes: number;
  comments: number;
  /** Shares, reach and saves only arrive through the Instagram Graph API
   * on an account we own — a public scrape cannot see them. */
  shares: number;
  reach: number;
  saves: number;
  /** Instagram's own total_interactions for the post */
  interactions: number;
  /** The Graph API media id — what a boost targets on the ads side */
  igMediaId?: string | null;
  // --- paid, summed over the window ---
  paidViews: number;
  spend: number;
  installs: number;
  paidInstalls: number;
}

/** (likes + comments + shares) / views — null when the post has no views yet */
export const engagementRate = (p: Pick<Post, "likes" | "comments" | "shares" | "organicViews">): number | null =>
  p.organicViews > 0 ? (p.likes + p.comments + p.shares) / p.organicViews : null;

/**
 * Engagement with an honest basis. Reels have public play counts, so the
 * rate is over views. Image and carousel posts have no public view count on
 * Instagram, so the rate is interactions over the account's followers — the
 * standard measure when views are not published. `basis` says which.
 */
export function engagement(
  p: Pick<Post, "likes" | "comments" | "shares" | "organicViews">,
  followers: number | undefined
): { rate: number | null; basis: "views" | "followers" | null } {
  const inter = p.likes + p.comments + p.shares;
  if (p.organicViews > 0) return { rate: inter / p.organicViews, basis: "views" };
  if (followers && followers > 0 && inter > 0) return { rate: inter / followers, basis: "followers" };
  return { rate: null, basis: null };
}

/** Platform-reported CPM on the paid side — null until the post has spend */
export const cpm = (p: Pick<Post, "spend" | "paidViews">): number | null =>
  p.paidViews > 0 && p.spend > 0 ? (p.spend / p.paidViews) * 1000 : null;

export type ConnectorStatus = "wired" | "needs-keys" | "planned";

export interface Connector {
  key: string;
  name: string;
  role: string;
  status: ConnectorStatus;
  summary: string;
  unlocks: string;
  needs: string;
}

/** Where paid money moves. Only meta is wired today. */
export type AdChannel = "meta" | "tiktok" | "x";

/** A real campaign on the ad platform, as the last sync pulled it. */
export interface Campaign {
  id: string;
  channel: AdChannel;
  name: string;
  objective: string | null;
  status: string;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  /** lifetime spend the platform reports for the campaign */
  lifetimeSpend: number;
  createdAt: string | null;
  adCount: number;
  /** pre-harness campaigns: paused, wrong objective, kept for history only */
  archived: boolean;
}

/** One real ad. Lifetime numbers as the platform reports them; results =
 * the campaign's optimisation event (installs for app campaigns). */
export interface Ad {
  id: string;
  channel: AdChannel;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  name: string;
  status: string;
  effectiveStatus: string | null;
  /** posts.id of the organic post this ad promotes, when known */
  sourcePostId: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  results: number;
  resultsLabel: string | null;
  /** Derived from the latest raw lifetime Meta install event, not results/clicks. */
  metaInstalls: number | null;
  metaInstallSpend: number | null;
  metaInstallsSyncedAt: string | null;
  /** AppStack attribution; a null sync timestamp means unknown, not zero. */
  installs: number;
  trials: number;
  purchases: number;
  attributionSyncedAt: string | null;
  appstackSpend: number | null;
}

export interface AdSet {
  id: string;
  channel: AdChannel;
  campaignId: string | null;
  campaignName: string | null;
  name: string;
  status: string;
  effectiveStatus: string | null;
  /** dollars per day — the only spend control we have */
  dailyBudget: number | null;
  optimizationGoal: string | null;
  promotedPixelId: string | null;
  promotedEvent: string | null;
  publisherPlatforms: string[] | null;
  devicePlatforms: string[] | null;
  userOs: string[] | null;
  createdAt: string | null;
}

export const adCpm = (a: Pick<Ad, "spend" | "impressions">): number | null =>
  a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null;
export const adCtr = (a: Pick<Ad, "clicks" | "impressions">): number | null =>
  a.impressions > 0 ? a.clicks / a.impressions : null;
export const adCostPerTrial = (a: Pick<Ad, "spend" | "trials">): number | null =>
  a.trials > 0 ? a.spend / a.trials : null;

export interface AppStackDay {
  lifecycle?: Record<string, { count: number | null; value: number | null }>;
  date: string; mediaSource: string; adId: string | null; campaignId: string | null;
  adName?: string | null; campaignName?: string | null;
  spend: number; impressions: number; clicks: number; installs: number; trials: number; subscriptions: number; purchases: number;
}
export interface AppStackReport { from: string; to: string; syncedAt: string; channels: AppStackDay[]; ads: AppStackDay[] }

export interface MetaAdDay {
  adId: string; date: string; spend: number; impressions: number; clicks: number;
  /** Meta's count of the ad set's optimisation event that day (purchases,
   * leads, link clicks… — whatever the campaign optimises for) */
  results: number;
  metaInstalls: number | null; metaInstallSpend: number | null;
}

/** Auto-off (lib/auto-off.ts): after an ad's first 7 days, the daily Meta
 * sync pauses it when its 7-day cost is over `limit`. `limit` is also the
 * alert line on the Paid tab. */
export interface AutoOffRule { enabled: boolean; limit: number | null }

/** One ad the rule paused, with the 7-day numbers it was judged on. */
export interface AutoOffEvent {
  adId: string; adName: string; at: string;
  spend: number; count: number;
  /** null when there were no results to divide by */
  cost: number | null;
  limit: number;
}

/** The one payload every surface reads — served from Supabase through
 * app/api/data. Empty arrays until a sync has landed something; the app
 * never invents a number to fill the gap. */
export interface Snapshot {
  demo: boolean;
  metaWritesEnabled: boolean;
  metaAdDays: MetaAdDay[];
  /** null unless the optional AppStack connector is wired */
  appstackReport: AppStackReport | null;
  /** When the posts feed was last synced from the platforms */
  postsSyncedAt: string | null;
  /** When the ads were last pulled from the platform */
  adsSyncedAt: string | null;
  posts: Post[];
  campaigns: Campaign[];
  ads: Ad[];
  adsets: AdSet[];
  accounts: Account[];
  connectors: Connector[];
  autoOff: AutoOffRule;
  /** newest first */
  autoOffLog: AutoOffEvent[];
}

export const PLATFORMS: Platform[] = ["instagram", "tiktok", "x", "youtube", "facebook"];

export function emptySnapshot(accounts: Account[] = [], connectors: Connector[] = []): Snapshot {
  return {
    demo: false,
    metaWritesEnabled: false,
    metaAdDays: [],
    appstackReport: null,
    postsSyncedAt: null,
    adsSyncedAt: null,
    posts: [],
    campaigns: [],
    ads: [],
    adsets: [],
    accounts,
    connectors,
    autoOff: { enabled: false, limit: null },
    autoOffLog: [],
  };
}

/** locked → no token on this device (sign-in screen) · live → unlocked */
export type SessionMode = "locked" | "live";

export const PLATFORM_META: Record<Platform, { label: string; url: (h: string) => string; display: (h: string) => string }> = {
  x: { label: "X", url: (h) => `https://x.com/${h}`, display: (h) => `@${h}` },
  instagram: { label: "Instagram", url: (h) => `https://www.instagram.com/${h}/`, display: (h) => `@${h}` },
  tiktok: { label: "TikTok", url: (h) => `https://www.tiktok.com/@${h}`, display: (h) => `@${h}` },
  youtube: { label: "YouTube", url: (h) => `https://www.youtube.com/@${h}`, display: (h) => `@${h}` },
  facebook: { label: "Facebook", url: (h) => `https://www.facebook.com/${h}`, display: (h) => h },
};

/** Which channels the harness currently drives. Everything else renders
 * greyed out until its connector is wired. */
export const LIVE_PLATFORMS: Platform[] = ["instagram", "tiktok", "x", "youtube", "facebook"];

/** Chart palette — validated (dataviz six checks) for light + dark
 * surfaces. Color follows the entity everywhere:
 * organic=cyan · paid/ads=violet · spend/trials/direct=orange ·
 * instagram/subs=pink · x/emerald. */
export const CHART = {
  organic: "#0891b2",
  paid: "#7c3aed",
  spend: "#ea580c",
  pink: "#ec4899",
  emerald: "#059669",
  red: "#dc2626",
  blue: "#2563eb",
};

export const CHANNEL_COLORS: Record<Platform, string> = {
  tiktok: CHART.organic,
  instagram: CHART.pink,
  x: CHART.emerald,
  youtube: CHART.red,
  facebook: CHART.blue,
};
