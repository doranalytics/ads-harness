import { authorized, supa, supaConfigured } from "@/lib/server";
import { graph, readMetaCreds } from "@/lib/meta";

// Direct Meta controls from the app. Flip a campaign / ad set / ad on or
// off, or set an ad set's daily budget. Meta is written first, then the
// matching row so the Paid tab reflects it before the next sync.
type Level = "campaign" | "adset" | "ad";
const TABLE: Record<Level, string> = { campaign: "campaigns", adset: "adsets", ad: "ads" };

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { level?: Level; id?: string; status?: "ACTIVE" | "PAUSED"; dailyBudget?: number };
  const { level, id } = body;
  if (!level || !TABLE[level] || !id || !/^\d+$/.test(id)) return Response.json({ error: "level and numeric id required" }, { status: 400 });
  const creds = await readMetaCreds();
  if (!creds) return Response.json({ error: "Meta isn't connected. Settings → Connector keys → Meta Ads." }, { status: 409 });

  const params: Record<string, string> = {};
  const patch: Record<string, unknown> = { synced_at: new Date().toISOString() };
  if (body.status === "ACTIVE" || body.status === "PAUSED") {
    params.status = body.status;
    patch.status = body.status;
    patch.effective_status = body.status; // Meta refines this (PENDING_REVIEW, CAMPAIGN_PAUSED…) on the next sync
  }
  if (level === "adset" && typeof body.dailyBudget === "number" && body.dailyBudget > 0) {
    params.daily_budget = String(Math.round(body.dailyBudget * 100)); // Meta wants minor units
    patch.daily_budget = Math.round(body.dailyBudget * 100) / 100;
  }
  if (Object.keys(params).length === 0) return Response.json({ error: "nothing to change" }, { status: 400 });

  try {
    await graph(creds.token, id, { method: "POST", params });
    const row = await supa(`${TABLE[level]}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    return Response.json({ ok: true, level, id, applied: params, rowUpdated: row.ok });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Meta update failed" }, { status: 502 });
  }
}
