import { timingSafeEqual } from "node:crypto";

/**
 * The door. Nothing renders without it — every number is real. A
 * correct password returns the bearer token the client then uses for every
 * call to the app's API routes. The token never ships in
 * the JS bundle.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return Response.json({ error: "The demo has no live session." }, { status: 409 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  const token = process.env.SESSION_TOKEN;
  if (!expected || !token) {
    return Response.json({ error: "unlock not configured" }, { status: 500 });
  }
  // Small fixed delay + constant-time compare keeps a casual guesser honest.
  await new Promise((r) => setTimeout(r, 350));
  const a = Buffer.from(String(password ?? ""));
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return Response.json({ error: "wrong password" }, { status: 401 });
  return Response.json({ token });
}
