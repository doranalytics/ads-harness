import { cronAuthorized, metaWritesEnabled, supaConfigured } from "@/lib/server";
import { syncMeta } from "@/lib/meta-sync";
import { runAutoOff } from "@/lib/auto-off";

export const maxDuration = 300;

/** Daily reporting, followed by automation only when both opt-ins are enabled. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });
  try {
    const report = await syncMeta(14);
    const autoOff = metaWritesEnabled() ? await runAutoOff() : { ran: false, checked: 0, paused: [], errors: [] };
    return Response.json({ ok: true, ...report, autoOff });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Automation skipped: sync failed." }, { status: 502 });
  }
}
