import { authorized, supa, supaConfigured, supaJson } from "@/lib/server";
import { createPostAd, findMediaId, readMetaCreds, readPromoteConfig, recordBoost, resolveIgIdentity } from "@/lib/meta";

export const maxDuration = 120;

/**
 * Promote: run an organic Instagram post as an ad. The post itself is the
 * creative (its likes/comments carry over, paid engagement flows back to
 * it); the ad joins your promote ad set ACTIVE, so it runs as soon as Meta
 * approves it. Budget stays on the ad set.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });

  const { postId } = (await req.json().catch(() => ({}))) as { postId?: string };
  if (!postId) return Response.json({ error: "postId required" }, { status: 400 });

  const creds = await readMetaCreds();
  if (!creds) {
    return Response.json(
      { error: "Meta isn't connected. Settings → Connector keys → Meta Ads: a System User token and your ad account id (docs/meta-business-setup.md)." },
      { status: 409 }
    );
  }
  const cfg = await readPromoteConfig();
  if ("missing" in cfg) {
    return Response.json({ error: `Promote isn't set up: add ${cfg.missing.join(", ")} in Settings → Connector keys → Meta Ads.` }, { status: 409 });
  }

  type PostRow = { id: string; account_id: string; url: string; title: string; ig_media_id: string | null };
  const [post] = await supaJson<PostRow[]>(`posts?id=eq.${encodeURIComponent(postId)}&select=id,account_id,url,title,ig_media_id&limit=1`);
  if (!post) return Response.json({ error: "post not found" }, { status: 404 });
  const [account] = await supaJson<{ handle: string; platform: string }[]>(`accounts?id=eq.${encodeURIComponent(post.account_id)}&select=handle,platform&limit=1`);
  if (!account || account.platform !== "instagram") return Response.json({ error: "only Instagram posts can be boosted" }, { status: 400 });

  // Already running? Don't mint a second ad for the same post.
  const existing = await supaJson<{ id: string; adset_name: string | null; effective_status: string | null }[]>(
    `ads?source_post_id=eq.${encodeURIComponent(postId)}&select=id,adset_name,effective_status&limit=5`
  );
  const live = existing.find((a) => (a.effective_status ?? "").toUpperCase() !== "DELETED");
  if (live) return Response.json({ error: `already promoted — ad ${live.id} in ${live.adset_name ?? "an ad set"}` }, { status: 409 });

  try {
    const identity = await resolveIgIdentity(creds, account.handle, cfg.pageId);

    const shortcode = post.url.match(/\/(?:p|reel)\/([^/?#]+)/)?.[1] ?? post.id.replace(/^ig-/, "");
    let mediaId = post.ig_media_id;
    if (!mediaId) {
      mediaId = await findMediaId(creds, identity.igUserId, shortcode);
      if (!mediaId) {
        await supa(`posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ promotable: false, promotable_reason: `Not in @${account.handle}'s owned media on Meta — a collab authored by another account, or archived` }) });
        return Response.json({ error: `Not promotable: this post isn't in @${account.handle}'s owned media on Meta (collab or archived).` }, { status: 404 });
      }
      await supa(`posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ig_media_id: mediaId }) });
    }

    // Named after the post so the ad is recognisable in Ads Manager.
    const name = (post.title || shortcode).slice(0, 90);
    const result = await createPostAd(creds, cfg, identity, mediaId, name);
    await recordBoost(creds, cfg, postId, result.adId, name);
    return Response.json({ ok: true, ...result, adsetId: cfg.adsetId, mediaId, instagramUserId: identity.igUserId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    if (/not eligible for advertising/i.test(message)) {
      await supa(`posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ promotable: false, promotable_reason: "Meta: this type of post is not eligible for advertising (licensed audio, collab or branded content)" }) });
      return Response.json({ error: "Not promotable: Meta says this type of post is not eligible for advertising." }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
