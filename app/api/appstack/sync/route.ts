import { authorized, cronAuthorized } from "@/lib/server";
import { AppStackNotConfigured, syncAppStack } from "@/lib/appstack";
export const maxDuration = 300;
async function run(req: Request) {
  if (!authorized(req) && !cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const report = await syncAppStack();
    return Response.json({ ok: true, syncedAt: report.syncedAt, from: report.from, to: report.to });
  } catch (error) {
    // Optional connector: not set up is a normal state, not a failure.
    if (error instanceof AppStackNotConfigured) return Response.json({ ok: true, skipped: error.message });
    return Response.json({ error: error instanceof Error ? error.message : "AppStack sync failed" }, { status: 502 });
  }
}

export const GET = run;
export const POST = run;
