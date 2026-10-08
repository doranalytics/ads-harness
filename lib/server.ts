// Server-side helpers for the app's own API routes. The browser never
// talks to Supabase — routes here read/write with the service key, gated
// by the same bearer token the unlock flow hands out.
import { timingSafeEqual } from "node:crypto";

export function authorized(req: Request): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return false;
  const token = process.env.SESSION_TOKEN;
  if (!token) return false;
  const got = req.headers.get("authorization") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Optional separately consented read credential. Never accepted by action routes. */
export function reportingAuthorized(req: Request): boolean {
  if (authorized(req)) return true;
  if (process.env.NEXT_PUBLIC_DEMO === "1") return false;
  const token = process.env.MCP_READ_TOKEN;
  if (!token) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(req: Request): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Live ad actions require an explicit deployment opt-in. Demo is always isolated. */
export const metaWritesEnabled = () => process.env.NEXT_PUBLIC_DEMO !== "1" && process.env.META_WRITES_ENABLED === "1";

export const META_WRITES_DISABLED = "Live ad actions are off. Your deployment owner can enable META_WRITES_ENABLED=1 after checking the ad set, budget and token permissions. Reporting still works.";

/** PostgREST limits each response to 1,000 rows; never judge a truncated window. */
export async function supaAll<T>(path: string, maxRows = 20000): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < maxRows; offset += 1000) {
    const page = await supaJson<T[]>(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error("Data window exceeds the safe row limit; auto-off skipped rather than judging incomplete data.");
}

export const supaConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** New secret keys use apikey only; legacy service_role JWTs also use Bearer. */
export function supaHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
}

export async function supa(path: string, init?: RequestInit): Promise<Response> {
  const url = process.env.SUPABASE_URL!.replace(/\/$/, "");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supaHeaders(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function supaJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await supa(path, init);
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
