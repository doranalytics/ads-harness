import { authorized, cronAuthorized, supaConfigured } from "@/lib/server";
import { MetaSyncError, syncMeta } from "@/lib/meta-sync";

// Five levels of Graph paging plus a few thousand upserts; well under this.
export const maxDuration = 300;

async function run(req: Request, days: number) {
  if (!authorized(req) && !cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });
  try {
    const report = await syncMeta(days);
    return Response.json({ ok: true, ...report });
  } catch (error) {
    const status = error instanceof MetaSyncError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : "Meta sync failed" }, { status });
  }
}

export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 3);
  return run(req, Number.isFinite(days) ? days : 3);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { days?: number };
  const q = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(body.days) ? Number(body.days) : Number.isFinite(q) && q > 0 ? q : 3;
  return run(req, days);
}
