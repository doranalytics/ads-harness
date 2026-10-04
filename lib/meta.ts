// Meta Marketing API, called directly from the app's API routes.
//
// Everything account-specific lives in Settings → Connector keys → Meta Ads
// (connector_secrets row `meta-ads`), never in code:
//   access_token   System User token from Business Settings with
//                  ads_management, ads_read, business_management,
//                  instagram_basic, pages_show_list, pages_read_engagement
//   ad_account_id  act_… (or just the number)
//   adset_id       the ad set every Promote lands in (it owns the budget)
//   page_id        the Facebook Page your Instagram account is connected to
//   link           where the ad sends people (your site, shop, booking page)
//   cta            call-to-action button: LEARN_MORE, SHOP_NOW, SIGN_UP, BOOK_NOW…
// META_* environment variables are the fallback for each.
// Setup walkthrough: docs/meta-business-setup.md.
import { supa, supaJson } from "@/lib/server";

const GRAPH = "https://graph.facebook.com/v21.0";

type MetaFields = { access_token?: string; ad_account_id?: string; adset_id?: string; page_id?: string; link?: string; cta?: string };

async function readFields(): Promise<MetaFields> {
  const rows = await supaJson<{ fields: MetaFields }[]>("connector_secrets?connector=eq.meta-ads&select=fields&limit=1");
  return rows[0]?.fields ?? {};
}
const pick = (v: string | undefined, env: string) => v?.trim() || process.env[env]?.trim() || "";

export interface MetaCreds { token: string; adAccount: string }

export async function readMetaCreds(): Promise<MetaCreds | null> {
  const f = await readFields();
  const token = pick(f.access_token, "META_ACCESS_TOKEN");
  const raw = pick(f.ad_account_id, "META_AD_ACCOUNT_ID");
  if (!token || !raw) return null;
  return { token, adAccount: raw.startsWith("act_") ? raw : `act_${raw}` };
}

/** Where a Promote lands and what the ad does. */
export interface PromoteConfig { adsetId: string; pageId: string; link: string; cta: string }

export async function readPromoteConfig(): Promise<PromoteConfig | { missing: string[] }> {
  const f = await readFields();
  const cfg = {
    adsetId: pick(f.adset_id, "META_ADSET_ID"),
    pageId: pick(f.page_id, "META_PAGE_ID"),
    link: pick(f.link, "META_AD_LINK"),
    cta: (pick(f.cta, "META_AD_CTA") || "LEARN_MORE").toUpperCase(),
  };
  const missing = [!cfg.adsetId && "adset_id", !cfg.pageId && "page_id", !cfg.link && "link"].filter(Boolean) as string[];
  return missing.length ? { missing } : cfg;
}

type Json = Record<string, unknown>;

export async function graph(token: string, path: string, init?: { method?: "GET" | "POST"; params?: Record<string, string> }): Promise<Json> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  const method = init?.method ?? "GET";
  const params = { ...(init?.params ?? {}), access_token: token };
  let body: string | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body,
  });
  const text = await res.text();
  let json: Json = {};
  try { json = JSON.parse(text); } catch { /* fallthrough to the status check */ }
  if (!res.ok) {
    const err = (json.error as { message?: string; code?: number; error_subcode?: number; error_user_title?: string; error_user_msg?: string } | undefined) ?? {};
    // Meta's readable reason lives in error_user_msg ("Ads creative post was
    // created by an app that is in development mode…"); message is just
    // "Invalid parameter". Surface the readable one first.
    const readable = err.error_user_msg ?? err.error_user_title;
    throw new Error(`meta ${path} ${res.status}: ${readable ? `${readable} — ` : ""}${err.message ?? text.slice(0, 200)}${err.code ? ` (code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})` : ""}`);
  }
  return json;
}

export interface IgIdentity { igUserId: string; username: string; pageId: string }

/**
 * The Instagram identity the ad runs under. Looks at the Pages the token can
 * see (plus your configured Page) for the one whose connected Instagram
 * business account is `username`; falls back to the ad account's Instagram
 * accounts list. Without this, Meta mints the ad under the wrong identity
 * and the creative is immutable.
 */
export async function resolveIgIdentity(creds: MetaCreds, username: string, configuredPageId: string): Promise<IgIdentity> {
  const want = username.toLowerCase();
  type Page = { id: string; name?: string; instagram_business_account?: { id: string; username?: string } };
  const pages: Page[] = [];
  try {
    const me = await graph(creds.token, "me/accounts", { params: { fields: "id,name,instagram_business_account{id,username}", limit: "50" } });
    pages.push(...((me.data as Page[] | undefined) ?? []));
  } catch { /* system-user tokens often have no /me/accounts — fall through to the configured page */ }
  for (const id of [configuredPageId]) {
    if (pages.some((p) => p.id === id)) continue;
    try {
      pages.push((await graph(creds.token, id, { params: { fields: "id,name,instagram_business_account{id,username}" } })) as Page);
    } catch { /* not assigned to this token */ }
  }
  const hit = pages.find((p) => p.instagram_business_account?.username?.toLowerCase() === want);
  if (hit?.instagram_business_account) return { igUserId: hit.instagram_business_account.id, username, pageId: hit.id };

  // Ads-side list: Instagram accounts attached to the ad account's business.
  type IgAcct = { id: string; username?: string };
  const acct = await graph(creds.token, `${creds.adAccount}/instagram_accounts`, { params: { fields: "id,username", limit: "50" } });
  const ig = ((acct.data as IgAcct[] | undefined) ?? []).find((a) => a.username?.toLowerCase() === want);
  if (ig) return { igUserId: ig.id, username, pageId: configuredPageId || pages[0]?.id };

  const seen = [
    ...pages.map((p) => `${p.name ?? p.id}→${p.instagram_business_account?.username ?? "no IG"}`),
    ...((acct.data as IgAcct[] | undefined) ?? []).map((a) => `ads:${a.username ?? a.id}`),
  ];
  throw new Error(`@${username} is not an Instagram identity this token can use (saw: ${seen.join(", ") || "nothing"}). Connect @${username} to your Facebook Page in Business Settings → Instagram accounts and assign it to the ad account.`);
}

/** Graph media id for a post, by shortcode, walking the account's media. */
export async function findMediaId(creds: MetaCreds, igUserId: string, shortcode: string): Promise<string | null> {
  type Media = { id: string; shortcode?: string; permalink?: string };
  let path: string | null = `${igUserId}/media`;
  let params: Record<string, string> | undefined = { fields: "id,shortcode,permalink", limit: "100" };
  for (let page = 0; page < 10 && path; page++) {
    const res = await graph(creds.token, path, { params });
    const hit = ((res.data as Media[] | undefined) ?? []).find((m) => m.shortcode === shortcode || m.permalink?.includes(`/${shortcode}/`));
    if (hit) return hit.id;
    const next = (res.paging as { next?: string } | undefined)?.next;
    if (!next) break;
    // `next` is a full URL carrying the token; strip back to path + query.
    const u = new URL(next);
    u.searchParams.delete("access_token");
    path = u.pathname.replace(/^\/v\d+\.\d+\//, "");
    params = Object.fromEntries(u.searchParams);
  }
  return null;
}

export interface BoostResult { creativeId: string; adId: string }

/**
 * ONE creative from the existing Instagram post, ONE LIVE ad in the promote
 * ad set. Live, not paused: the ad set already owns the budget, so the new
 * ad shares it from the moment Meta approves it. Never re-uploads the video —
 * that would mint a new media object with zero likes and comments.
 */
export async function createPostAd(creds: MetaCreds, cfg: PromoteConfig, id: IgIdentity, mediaId: string, name: string): Promise<BoostResult> {
  const creative = await graph(creds.token, `${creds.adAccount}/adcreatives`, {
    method: "POST",
    params: {
      name,
      object_id: id.pageId,
      instagram_user_id: id.igUserId,
      source_instagram_media_id: mediaId,
      call_to_action: JSON.stringify({ type: cfg.cta, value: { link: cfg.link } }),
    },
  });
  const creativeId = String(creative.id);
  const ad = await graph(creds.token, `${creds.adAccount}/ads`, {
    method: "POST",
    params: {
      name,
      adset_id: cfg.adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: "ACTIVE",
    },
  });
  return { creativeId, adId: String(ad.id) };
}

/** Record the ad so the Paid tab and the post card see it before the next sync. */
export async function recordBoost(creds: MetaCreds, cfg: PromoteConfig, postId: string, adId: string, name: string): Promise<void> {
  // The ad set knows its name; ask rather than configure it twice. The
  // campaign link fills in on the next sync.
  const set = await graph(creds.token, cfg.adsetId, { params: { fields: "name" } }).catch(() => ({} as Json));
  const up = await supa("ads?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      id: adId,
      channel: "meta",
      adset_id: cfg.adsetId,
      adset_name: set.name ? String(set.name) : null,
      name,
      status: "ACTIVE",
      effective_status: "PENDING_REVIEW",
      source_post_id: postId,
      created_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    }]),
  });
  if (!up.ok) throw new Error(`ads upsert ${up.status}: ${(await up.text()).slice(0, 200)}`);
  await supa(`posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ boosted: true }) });
}
