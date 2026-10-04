import { authorized, supaConfigured, supa } from "@/lib/server";
import { PLATFORMS } from "@/lib/types";

const PREFIX: Record<string, string> = { instagram: "ig", tiktok: "tt", x: "x", youtube: "yt", facebook: "fb" };

/** Replace the account roster (Settings → Save roster, live mode). */
export async function PUT(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!supaConfigured()) return Response.json({ error: "supabase not configured" }, { status: 500 });

  const { accounts } = (await req.json().catch(() => ({}))) as {
    accounts?: { id: string; platform: string; handle: string; label: string; kind: string }[];
  };
  if (!Array.isArray(accounts)) return Response.json({ error: "accounts required" }, { status: 400 });

  const rows = accounts
    .filter((a) => a?.handle?.trim() && (PLATFORMS as string[]).includes(a.platform))
    .map((a) => {
      const handle = String(a.handle).replace(/^@/, "").trim().toLowerCase().slice(0, 80);
      // The syncs key posts off "<prefix>-<handle>" (ig-yourhandle).
      return { a, handle, id: `${PREFIX[a.platform]}-${handle}` };
    })
    .map(({ a, handle, id }) => ({
      id,
      platform: a.platform,
      handle,
      label: String(a.label ?? "").slice(0, 80),
      kind: a.kind === "brand" ? "brand" : "personal",
    }));

  const up = await supa("accounts", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!up.ok) return Response.json({ error: `upsert: ${up.status}` }, { status: 502 });

  // Roster is authoritative: drop accounts that were removed in Settings.
  const keep = rows.map((r) => `"${r.id}"`).join(",");
  if (rows.length > 0) {
    await supa(`accounts?id=not.in.(${keep})`, { method: "DELETE" });
  }
  return Response.json({ ok: true, count: rows.length });
}
