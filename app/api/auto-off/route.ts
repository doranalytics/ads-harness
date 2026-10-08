import { authorized, supa, supaConfigured, metaWritesEnabled, META_WRITES_DISABLED } from "@/lib/server";
import { AUTO_OFF_MIGRATION } from "@/lib/auto-off";

// Saves the auto-off rule: on/off and the cost limit. The rule itself runs
// in separately enabled daily automation (lib/auto-off.ts).
export async function PUT(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; limit?: number | null };
  if (body.enabled === true && !metaWritesEnabled()) return Response.json({ error: META_WRITES_DISABLED }, { status: 403 });
  const row: Record<string, unknown> = { id: "default", updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") row.enabled = body.enabled;
  if (body.limit === null) row.cost_limit = null;
  else if (typeof body.limit === "number" && body.limit > 0) row.cost_limit = Math.round(body.limit * 100) / 100;
  if (Object.keys(row).length === 2) return Response.json({ error: "nothing to change" }, { status: 400 });

  const res = await supa("auto_off?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  if (res.status === 404) return Response.json({ error: `Auto-off isn't set up in this database. ${AUTO_OFF_MIGRATION}` }, { status: 409 });
  if (!res.ok) return Response.json({ error: `supabase: ${res.status} ${await res.text()}` }, { status: 502 });
  return Response.json({ ok: true });
}
