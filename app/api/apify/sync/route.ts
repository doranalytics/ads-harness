import { authorized, cronAuthorized, supa, supaConfigured, supaJson } from "@/lib/server";
import { readApifyToken, syncFollowers, syncPosts } from "@/lib/apify";

// One actor run per platform in the roster, each a minute or two.
export const maxDuration = 300;

/**
 * Pulls the latest posts and today's follower count for every account in
 * the roster through Apify. Runs daily on Vercel Cron (vercel.json) and
 * from the Connectors tab's Sync button.
 */
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  if (!authorized(req) && !cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });

  const token = await readApifyToken();
  if (!token) {
    await supa("connectors?key=eq.apify", { method: "PATCH", body: JSON.stringify({ status: "needs-keys", needs: "Apify API token — paste it in Settings → Connector keys" }) });
    return Response.json({ error: "no Apify token saved" }, { status: 409 });
  }

  const accounts = await supaJson<{ id: string; platform: string; handle: string }[]>("accounts?select=id,platform,handle&order=id");
  try {
    const [result, postSync] = await Promise.all([syncFollowers(token, accounts), syncPosts(token, accounts)]);
    const failed = result.reads.filter((r) => r.error);
    // The pipe is wired as soon as any read lands; dead handles are a
    // roster problem, surfaced in `needs` so the card says which ones.
    const anyOk = result.reads.some((r) => r.followers !== null);
    const needs = anyOk
      ? failed.length
        ? `handles not found: ${failed.map((f) => `${f.platform}/@${f.handle}`).join(", ")} — fix in Settings`
        : ""
      : failed[0]?.error ?? "every read failed";
    await supa("connectors?key=eq.apify", {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: anyOk ? "wired" : "needs-keys", needs: needs.slice(0, 300) }),
    });
    return Response.json({ ok: anyOk, ...result, posts: postSync });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await supa("connectors?key=eq.apify", { method: "PATCH", body: JSON.stringify({ status: "needs-keys", needs: message.slice(0, 300) }) });
    return Response.json({ error: message }, { status: 502 });
  }
}
