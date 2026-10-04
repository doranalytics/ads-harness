// Server-side helpers for the app's own API routes. The browser never
// talks to Supabase — routes here read/write with the service key, gated
// by the same bearer token the unlock flow hands out.
import { timingSafeEqual } from "node:crypto";

export function authorized(req: Request): boolean {
  const token = process.env.SESSION_TOKEN;
  if (!token) return false;
  const got = req.headers.get("authorization") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const supaConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function supa(path: string, init?: RequestInit): Promise<Response> {
  const url = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
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
