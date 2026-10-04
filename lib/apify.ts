// Apify — public scrapes for the accounts in the roster: the latest posts
// (views, likes, comments, cover) feed the Organic tab, and a daily follower
// count lands in daily_account_metrics. No login to the account needed.
//
// The token is saved from Settings → Connector keys into connector_secrets
// (service role only); APIFY_TOKEN in the environment is the fallback.
import { supa, supaJson } from "@/lib/server";
import { storeCover } from "@/lib/covers";

const API = "https://api.apify.com/v2";

export async function readApifyToken(): Promise<string | null> {
  const rows = await supaJson<{ fields: { token?: string } }[]>("connector_secrets?connector=eq.apify&select=fields&limit=1");
  const token = rows[0]?.fields?.token?.trim();
  return token || process.env.APIFY_TOKEN?.trim() || null;
}

/** Runs an actor synchronously and returns its default dataset. */
async function runActor<T>(token: string, actor: string, input: Record<string, unknown>, timeoutSecs = 120): Promise<T[]> {
  const res = await fetch(`${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeoutSecs}`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`apify ${actor} ${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body) as T[];
}

export interface ProfileRead {
  accountId: string;
  handle: string;
  platform: string;
  followers: number | null;
  error: string | null;
}

type Account = { id: string; platform: string; handle: string };

// One actor per platform; each is a public, keyless-to-run scrape.
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function instagram(token: string, accounts: Account[]): Promise<ProfileRead[]> {
  type Row = { username?: string; followersCount?: number; error?: string | null };
  const rows = await runActor<Row>(token, "apify~instagram-profile-scraper", { usernames: accounts.map((a) => a.handle) });
  return accounts.map((a) => {
    const row = rows.find((r) => r.username?.toLowerCase() === a.handle.toLowerCase());
    if (!row) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: "not returned by scraper" };
    if (row.error) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: row.error };
    return { accountId: a.id, handle: a.handle, platform: a.platform, followers: num(row.followersCount), error: null };
  });
}

async function tiktok(token: string, accounts: Account[]): Promise<ProfileRead[]> {
  type Row = { input?: string; error?: string; authorMeta?: { name?: string; fans?: number } };
  const rows = await runActor<Row>(token, "clockworks~tiktok-profile-scraper", {
    profiles: accounts.map((a) => a.handle),
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  });
  return accounts.map((a) => {
    const h = a.handle.toLowerCase();
    const row = rows.find((r) => r.authorMeta?.name?.toLowerCase() === h || r.input?.toLowerCase() === h);
    if (!row) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: "not returned by scraper" };
    if (row.error) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: row.error };
    return { accountId: a.id, handle: a.handle, platform: a.platform, followers: num(row.authorMeta?.fans), error: null };
  });
}

async function x(token: string, accounts: Account[]): Promise<ProfileRead[]> {
  type Row = { userName?: string; followers?: number; error?: string };
  const rows = await runActor<Row>(token, "apidojo~twitter-user-scraper", {
    twitterHandles: accounts.map((a) => a.handle),
    getFollowers: false,
    getFollowing: false,
    maxItems: accounts.length,
  });
  return accounts.map((a) => {
    const row = rows.find((r) => r.userName?.toLowerCase() === a.handle.toLowerCase());
    if (!row) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: "not returned by scraper" };
    if (row.error) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: row.error };
    return { accountId: a.id, handle: a.handle, platform: a.platform, followers: num(row.followers), error: null };
  });
}

// Shorts-only with one result: the channel header (subscribers) rides on
// every item, and this read finishes in ~10s where a full listing does not.
async function youtube(token: string, accounts: Account[]): Promise<ProfileRead[]> {
  type Row = { channelUsername?: string; numberOfSubscribers?: number; error?: string };
  const rows = await runActor<Row>(token, "streamers~youtube-scraper", {
    startUrls: accounts.map((a) => ({ url: `https://www.youtube.com/@${a.handle}/shorts` })),
    maxResults: 0,
    maxResultsShorts: 1,
    maxResultStreams: 0,
  });
  return accounts.map((a) => {
    const row = rows.find((r) => r.channelUsername?.toLowerCase() === a.handle.toLowerCase());
    if (!row) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: rows[0]?.error ?? "not returned by scraper" };
    return { accountId: a.id, handle: a.handle, platform: a.platform, followers: num(row.numberOfSubscribers), error: null };
  });
}

async function facebook(token: string, accounts: Account[]): Promise<ProfileRead[]> {
  type Row = { pageName?: string; pageUrl?: string; followers?: number; error?: string };
  const rows = await runActor<Row>(token, "apify~facebook-pages-scraper", {
    startUrls: accounts.map((a) => ({ url: `https://www.facebook.com/${a.handle}` })),
  });
  return accounts.map((a) => {
    const h = a.handle.toLowerCase();
    const row = rows.find((r) => r.pageName?.toLowerCase() === h || r.pageUrl?.toLowerCase().includes(`/${h}`));
    if (!row) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: "not returned by scraper" };
    if (row.error) return { accountId: a.id, handle: a.handle, platform: a.platform, followers: null, error: row.error };
    return { accountId: a.id, handle: a.handle, platform: a.platform, followers: num(row.followers), error: null };
  });
}

const SCRAPERS: Record<string, (token: string, accounts: Account[]) => Promise<ProfileRead[]>> = { instagram, tiktok, x, youtube, facebook };

/**
 * Reads today's follower count for every account in the roster and upserts
 * it into daily_account_metrics. A handle the platform no longer knows is
 * reported, not written — a zero would read as a lost audience.
 */
export async function syncFollowers(token: string, accounts: Account[]): Promise<{ date: string; reads: ProfileRead[] }> {
  const date = new Date().toISOString().slice(0, 10);
  const byPlatform = new Map<string, Account[]>();
  for (const a of accounts) byPlatform.set(a.platform, [...(byPlatform.get(a.platform) ?? []), a]);

  // One actor run per platform, all at once — the route's budget is the
  // slowest platform, not the sum.
  const groups = await Promise.all(
    [...byPlatform].map(async ([platform, group]): Promise<ProfileRead[]> => {
      const scrape = SCRAPERS[platform];
      if (!scrape) return group.map((a) => ({ accountId: a.id, handle: a.handle, platform, followers: null, error: "no scraper for platform" }));
      try {
        return await scrape(token, group);
      } catch (err) {
        const error = err instanceof Error ? err.message : "scrape failed";
        return group.map((a) => ({ accountId: a.id, handle: a.handle, platform, followers: null, error }));
      }
    })
  );
  const reads = groups.flat();

  const rows = reads.filter((r) => r.followers !== null).map((r) => ({ date, account_id: r.accountId, followers: r.followers }));
  if (rows.length) {
    const up = await supa("daily_account_metrics?on_conflict=date,account_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!up.ok) throw new Error(`daily_account_metrics upsert ${up.status}: ${(await up.text()).slice(0, 300)}`);
  }
  return { date, reads };
}

// -----------------------------------------------------------------------------
// Posts — the last ~20 per channel, so every channel card and feed carries
// views, likes, comments and engagement, not just followers.
// -----------------------------------------------------------------------------

export interface ScrapedPost {
  id: string;
  accountId: string;
  date: string;
  title: string;
  caption: string;
  url: string;
  format: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  cover: string | null;
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? Math.round(x) : 0;
};
const firstLine = (t: string) => (t ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? "";
const day = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : new Date(NaN);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};
const byHandle = (accounts: Account[], handle: string | undefined) =>
  handle ? accounts.find((a) => a.handle.toLowerCase() === handle.toLowerCase()) : undefined;

// How far back each sync reads per account. Apify bills per result, so
// lower this to cut cost.
const POSTS_PER_CHANNEL = 50;

async function instagramPosts(token: string, accounts: Account[]): Promise<ScrapedPost[]> {
  type Row = { shortCode?: string; type?: string; productType?: string; url?: string; timestamp?: string; caption?: string; likesCount?: number; commentsCount?: number; videoPlayCount?: number; videoViewCount?: number; displayUrl?: string; ownerUsername?: string };
  const rows = await runActor<Row>(token, "apify~instagram-scraper", {
    directUrls: accounts.map((a) => `https://www.instagram.com/${a.handle}/`),
    resultsType: "posts",
    resultsLimit: POSTS_PER_CHANNEL,
    addParentData: false,
  });
  const out: ScrapedPost[] = [];
  for (const r of rows) {
    const acct = byHandle(accounts, r.ownerUsername);
    if (!acct || !r.shortCode) continue;
    const reel = r.productType === "clips" || r.type === "Video";
    out.push({
      id: `ig-${r.shortCode}`, accountId: acct.id, date: day(r.timestamp), title: firstLine(r.caption ?? ""), caption: r.caption ?? "",
      url: reel ? `https://www.instagram.com/reel/${r.shortCode}/` : `https://www.instagram.com/p/${r.shortCode}/`,
      format: reel ? "reel" : r.type === "Sidecar" ? "carousel" : "image",
      views: n(r.videoPlayCount ?? r.videoViewCount), likes: n(r.likesCount), comments: n(r.commentsCount), shares: 0, cover: r.displayUrl ?? null,
    });
  }
  return out;
}

async function tiktokPosts(token: string, accounts: Account[]): Promise<ScrapedPost[]> {
  type Row = { id?: string; text?: string; createTimeISO?: string; webVideoUrl?: string; playCount?: number; diggCount?: number; commentCount?: number; shareCount?: number; videoMeta?: { coverUrl?: string }; authorMeta?: { name?: string }; error?: string };
  const rows = await runActor<Row>(token, "clockworks~tiktok-profile-scraper", {
    profiles: accounts.map((a) => a.handle),
    resultsPerPage: POSTS_PER_CHANNEL,
    profileSorting: "latest",
    shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false,
  });
  const out: ScrapedPost[] = [];
  for (const r of rows) {
    const acct = byHandle(accounts, r.authorMeta?.name);
    if (!acct || !r.id || r.error) continue;
    out.push({
      id: `tt-${r.id}`, accountId: acct.id, date: day(r.createTimeISO), title: firstLine(r.text ?? ""), caption: r.text ?? "",
      url: r.webVideoUrl ?? `https://www.tiktok.com/@${acct.handle}/video/${r.id}`, format: "video",
      views: n(r.playCount), likes: n(r.diggCount), comments: n(r.commentCount), shares: n(r.shareCount), cover: r.videoMeta?.coverUrl ?? null,
    });
  }
  return out;
}

async function youtubePosts(token: string, accounts: Account[]): Promise<ScrapedPost[]> {
  type Row = { id?: string; type?: string; url?: string; title?: string; date?: string; viewCount?: number; likes?: number; commentsCount?: number; thumbnailUrl?: string; channelUsername?: string; error?: string };
  const rows = await runActor<Row>(token, "streamers~youtube-scraper", {
    startUrls: accounts.map((a) => ({ url: `https://www.youtube.com/@${a.handle}` })),
    maxResults: POSTS_PER_CHANNEL / 2, maxResultsShorts: POSTS_PER_CHANNEL / 2, maxResultStreams: 0,
  }, 270); // YouTube walks two listings; 100 items needs more than the default two minutes
  const out: ScrapedPost[] = [];
  for (const r of rows) {
    const acct = byHandle(accounts, r.channelUsername);
    if (!acct || !r.id || r.error) continue;
    out.push({
      id: `yt-${r.id}`, accountId: acct.id, date: day(r.date), title: (r.title ?? "").slice(0, 120), caption: r.title ?? "",
      url: r.url ?? `https://www.youtube.com/watch?v=${r.id}`, format: r.type === "shorts" ? "short" : "video",
      views: n(r.viewCount), likes: n(r.likes), comments: n(r.commentsCount), shares: 0, cover: r.thumbnailUrl ?? null,
    });
  }
  return out;
}

async function facebookPosts(token: string, accounts: Account[]): Promise<ScrapedPost[]> {
  type Row = { postId?: string; url?: string; time?: string; text?: string; likes?: number; shares?: number; comments?: number; commentsCount?: number; viewsCount?: number; pageName?: string; media?: { thumbnail?: string; photo_image?: { uri?: string } }[] };
  const rows = await runActor<Row>(token, "apify~facebook-posts-scraper", {
    startUrls: accounts.map((a) => ({ url: `https://www.facebook.com/${a.handle}` })),
    resultsLimit: POSTS_PER_CHANNEL,
    captionText: false,
  });
  const out: ScrapedPost[] = [];
  for (const r of rows) {
    const acct = byHandle(accounts, r.pageName);
    if (!acct || !r.postId) continue;
    const m = r.media?.[0];
    out.push({
      id: `fb-${r.postId}`, accountId: acct.id, date: day(r.time), title: firstLine(r.text ?? ""), caption: r.text ?? "",
      url: r.url ?? `https://www.facebook.com/${r.postId}`, format: "post",
      // Facebook does not expose view counts on a public page scrape; 0 is honest.
      views: n(r.viewsCount), likes: n(r.likes), comments: n(r.comments ?? r.commentsCount), shares: n(r.shares), cover: m?.thumbnail ?? m?.photo_image?.uri ?? null,
    });
  }
  return out;
}

async function xPosts(token: string, accounts: Account[]): Promise<ScrapedPost[]> {
  type Row = { id?: string; url?: string; text?: string; fullText?: string; createdAt?: string; viewCount?: number; likeCount?: number; replyCount?: number; retweetCount?: number; quoteCount?: number; isRetweet?: boolean; author?: { userName?: string }; extendedEntities?: { media?: { media_url_https?: string }[] } };
  const rows = await runActor<Row>(token, "apidojo~twitter-scraper-lite", {
    searchTerms: accounts.map((a) => `from:${a.handle} -filter:retweets`),
    maxItems: POSTS_PER_CHANNEL * accounts.length,
    sort: "Latest",
  });
  const out: ScrapedPost[] = [];
  for (const r of rows) {
    const acct = byHandle(accounts, r.author?.userName);
    if (!acct || !r.id || r.isRetweet) continue;
    const text = r.fullText ?? r.text ?? "";
    out.push({
      id: `x-${r.id}`, accountId: acct.id, date: day(r.createdAt), title: firstLine(text), caption: text,
      url: r.url ?? `https://x.com/${acct.handle}/status/${r.id}`, format: r.extendedEntities?.media?.length ? "media" : "text",
      views: n(r.viewCount), likes: n(r.likeCount), comments: n(r.replyCount), shares: n(r.retweetCount) + n(r.quoteCount),
      cover: r.extendedEntities?.media?.[0]?.media_url_https ?? null,
    });
  }
  return out;
}

const POST_SCRAPERS: Record<string, (token: string, accounts: Account[]) => Promise<ScrapedPost[]>> = {
  instagram: instagramPosts, tiktok: tiktokPosts, youtube: youtubePosts, facebook: facebookPosts, x: xPosts,
};

const PREFIX: Record<string, string> = { instagram: "ig", tiktok: "tt", youtube: "yt", facebook: "fb", x: "x" };

export interface PostSyncResult {
  posts: number;
  covers: number;
  errors: Record<string, string>;
}

/**
 * Upserts the latest posts per channel into `posts` and writes each post's
 * view delta since the previous read into daily_post_metrics, so the channel
 * series keeps working. Covers are copied into the `covers` bucket once (CDN
 * urls expire); a post we already hold keeps its cover.
 */
export async function syncPosts(token: string, accounts: Account[]): Promise<PostSyncResult> {
  const byPlatform = new Map<string, Account[]>();
  for (const a of accounts) if (POST_SCRAPERS[a.platform]) byPlatform.set(a.platform, [...(byPlatform.get(a.platform) ?? []), a]);

  const errors: Record<string, string> = {};
  const groups = await Promise.all(
    [...byPlatform].map(async ([platform, group]) => {
      try {
        return await POST_SCRAPERS[platform](token, group);
      } catch (err) {
        errors[platform] = err instanceof Error ? err.message : "scrape failed";
        return [] as ScrapedPost[];
      }
    })
  );
  const scraped = groups.flat();
  if (!scraped.length) return { posts: 0, covers: 0, errors };

  const ids = scraped.map((p) => `"${p.id}"`).join(",");
  const existing = await supaJson<{ id: string; views: number; thumbnail_url: string | null }[]>(`posts?id=in.(${ids})&select=id,views,thumbnail_url`);
  const prior = new Map(existing.map((e) => [e.id, e]));

  // Covers in batches of ten: a first read stores a few hundred, and one at
  // a time would blow the route's budget.
  let covers = 0;
  const thumbs = new Map<string, string | null>();
  const need = scraped.filter((p) => p.cover && !prior.get(p.id)?.thumbnail_url);
  for (let i = 0; i < need.length; i += 10) {
    await Promise.all(
      need.slice(i, i + 10).map(async (p) => {
        const prefix = PREFIX[accounts.find((a) => a.id === p.accountId)?.platform ?? ""] ?? "misc";
        const url = await storeCover(p.id.replace(/^[a-z]+-/, ""), p.cover!, prefix);
        if (url) covers++;
        thumbs.set(p.id, url);
      })
    );
  }
  const rows = scraped.map((p) => ({
    id: p.id, account_id: p.accountId, date: p.date, title: p.title, caption: p.caption, url: p.url, format: p.format,
    views: p.views, likes: p.likes, comments: p.comments, shares: p.shares,
    thumbnail_url: prior.get(p.id)?.thumbnail_url ?? thumbs.get(p.id) ?? null, synced_at: new Date().toISOString(),
  }));
  const up = await supa("posts?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!up.ok) throw new Error(`posts upsert ${up.status}: ${(await up.text()).slice(0, 300)}`);

  // View deltas → the channel series. A first read has no yesterday; skip it
  // rather than booking lifetime views as today's.
  const today = new Date().toISOString().slice(0, 10);
  const deltas = scraped
    .filter((p) => prior.has(p.id))
    .map((p) => ({ date: today, post_id: p.id, organic_views: Math.max(0, p.views - (prior.get(p.id)?.views ?? 0)) }));
  if (deltas.length) {
    await supa("daily_post_metrics?on_conflict=date,post_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(deltas),
    });
  }
  return { posts: rows.length, covers, errors };
}
