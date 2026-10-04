import { authorized, supaConfigured, supa } from "@/lib/server";

const KNOWN = ["meta-ads", "apify", "appstack"];

/**
 * Write-only connector credentials. They land in connector_secrets (service
 * role only — no anon policy exists on that table) where the app's
 * routes read them server-side. Nothing here ever returns a
 * stored secret to a browser.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });

  const { key, fields } = (await req.json().catch(() => ({}))) as { key?: string; fields?: Record<string, string> };
  if (!key || !KNOWN.includes(key)) return Response.json({ error: "unknown connector" }, { status: 400 });
  const clean = Object.fromEntries(
    Object.entries(fields ?? {})
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => [k.slice(0, 64), v.trim().slice(0, 500)])
  );
  if (Object.keys(clean).length === 0) return Response.json({ error: "no fields" }, { status: 400 });

  // Merge into what's stored, so saving one field never wipes the others.
  const prior = await supa(`connector_secrets?connector=eq.${key}&select=fields&limit=1`);
  const existing = prior.ok ? ((await prior.json()) as { fields: Record<string, string> }[])[0]?.fields ?? {} : {};
  const up = await supa("connector_secrets", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ connector: key, fields: { ...existing, ...clean }, updated_at: new Date().toISOString() }]),
  });
  if (!up.ok) return Response.json({ error: `upsert: ${up.status}` }, { status: 502 });
  return Response.json({ ok: true });
}
