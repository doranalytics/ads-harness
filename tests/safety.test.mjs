import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const cost = loadTs("lib/cost.ts");
const now = Date.parse("2026-10-08T12:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
async function automation(options = {}) {
  const calls = [];
  const writes = [];
  const ads = options.ads ?? [{ id: "123", name: "Example ad", created_at: "2026-09-20T00:00:00Z", auto_off_started_at: null, synced_at: new FixedDate().toISOString() }];
  const daily = options.daily ?? [{ ad_id: "123", date: "2026-10-07", spend: 80, results: 2 }];
  const server = {
    metaWritesEnabled: () => options.writesEnabled ?? true,
    supaJson: async (path) => {
      calls.push(path);
      if (path.startsWith("auto_off?")) return [{ enabled: options.enabled ?? true, cost_limit: 20 }];
      if (path.startsWith("auto_off_log?")) return [];
      if (path.startsWith("appstack_cache?")) return options.appstack ? [{ payload: options.appstack }] : [];
      throw new Error(path);
    },
    supaAll: async (path) => path.startsWith("ads?") ? ads : daily,
    supa: async (path, init) => { writes.push({ path, body: JSON.parse(init.body) }); return { ok: !options.databaseFailure }; },
  };
  const meta = { readMetaCreds: async () => ({ token: "test-only", adAccount: "act_123" }), graph: async (_token, id, init) => { calls.push({ id, ...init }); return {}; } };
  const api = loadTs("lib/auto-off.ts", { "./cost": cost, "./server": server, "./meta": meta }, { Date: FixedDate });
  return { report: await api.runAutoOff(), calls, writes };
}

test("demo blocks authenticated API and cron even if secrets are configured", () => {
  const env = { NEXT_PUBLIC_DEMO: "1", SESSION_TOKEN: "offline-test", CRON_SECRET: "offline-test", META_WRITES_ENABLED: "1" };
  const s = loadTs("lib/server.ts", {}, { process: { env } });
  const req = new Request("http://localhost", { headers: { authorization: "Bearer offline-test" } });
  assert.equal(s.authorized(req), false);
  assert.equal(s.cronAuthorized(req), false);
  assert.equal(s.metaWritesEnabled(), false);
  delete env.NEXT_PUBLIC_DEMO;
  assert.equal(s.authorized(req), true);
  delete env.META_WRITES_ENABLED;
  assert.equal(s.metaWritesEnabled(), false);
});
test("Supabase new secrets are never sent as JWT Bearer tokens", () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_OFFLINE_EXAMPLE" };
  const s = loadTs("lib/server.ts", {}, { process: { env } });
  assert.equal(s.supaHeaders().Authorization, undefined);
  env.SUPABASE_SERVICE_ROLE_KEY = "legacy-test-JWT";
  assert.equal(s.supaHeaders().Authorization, "Bearer legacy-test-JWT");
});
test("deployment gate and saved rule both default to no automation", async () => {
  const gated = await automation({ writesEnabled: false });
  assert.equal(gated.calls.length, 0);
  assert.equal(gated.report.ran, false);
  const disabled = await automation({ enabled: false });
  assert.equal(disabled.report.ran, false);
  assert.equal(disabled.writes.length, 0);
});
test("mature fresh ad above pooled cost limit is paused and logged", async () => {
  const a = await automation();
  assert.equal(a.report.paused.length, 1);
  assert.equal(a.report.paused[0].cost, 40);
  assert.equal(a.calls.find((c) => typeof c === "object").params.status, "PAUSED");
  assert.equal(a.writes.length, 2);
});
test("zero spend and cost equal to limit do not pause; spend without results can", async () => {
  for (const row of [{ spend: 0, results: 0 }, { spend: 40, results: 2 }]) {
    assert.equal((await automation({ daily: [{ ad_id: "123", date: "2026-10-07", ...row }] })).report.paused.length, 0);
  }
  assert.equal((await automation({ daily: [{ ad_id: "123", date: "2026-10-07", spend: 21, results: 0 }] })).report.paused.length, 1);
});
test("new, restarted, unknown-age and stale ads cannot be judged", async () => {
  for (const changes of [
    { created_at: "2026-10-04T00:00:00Z" },
    { auto_off_started_at: "2026-10-07T00:00:00Z" },
    { created_at: null },
    { synced_at: "2026-10-07T00:00:00Z" },
  ]) {
    const a = await automation({ ads: [{ id: "123", name: "Example", created_at: "2026-09-20T00:00:00Z", auto_off_started_at: null, synced_at: new FixedDate().toISOString(), ...changes }] });
    assert.equal(a.report.paused.length, 0);
    assert.equal(a.report.checked, 0);
  }
});
test("unknown results and incomplete attribution fail closed", async () => {
  assert.equal((await automation({ daily: [{ ad_id: "123", date: "2026-10-07", spend: 100, results: null }] })).report.checked, 0);
  const a = await automation({ appstack: { from: "2026-10-05", to: "2026-10-07", syncedAt: new FixedDate().toISOString(), ads: [] } });
  assert.equal(a.report.paused.length, 0);
  assert.equal(a.report.errors.length, 1);
});
test("Meta success with database failure reports the real pause plus an error", async () => {
  const a = await automation({ databaseFailure: true });
  assert.equal(a.report.paused.length, 1);
  assert.match(a.report.errors[0], /paused on Meta/);
});
test("manual reporting route has no automation side effects", async () => {
  let syncs = 0;
  const route = loadTs("app/api/meta/sync/route.ts", {
    "@/lib/server": { authorized: () => true, cronAuthorized: () => false, supaConfigured: () => true },
    "@/lib/meta-sync": { MetaSyncError: Error, syncMeta: async () => { syncs++; return { ads: 3 }; } },
  });
  assert.equal((await route.POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status, 200);
  assert.equal(syncs, 1);
});
test("ad creation sends PAUSED to Meta, never ACTIVE", async () => {
  const requests = [];
  const meta = loadTs("lib/meta.ts", { "@/lib/server": {} }, { fetch: async (url, init) => {
    requests.push({ url: String(url), params: Object.fromEntries(new URLSearchParams(init.body)) });
    return Response.json({ id: requests.length === 1 ? "creative-test" : "ad-test" });
  } });
  await meta.createPostAd({ token: "offline-test", adAccount: "act_123" }, { adsetId: "456", pageId: "789", link: "https://example.com", cta: "LEARN_MORE" }, { igUserId: "101", pageId: "789", username: "example" }, "102", "Example");
  assert.equal(requests[1].params.status, "PAUSED");
  assert.equal(requests[1].params.adset_id, "456");
});
test("activation without confirmation is rejected before Meta or database access", async () => {
  const route = loadTs("app/api/meta/control/route.ts", {
    "@/lib/server": { authorized: () => true, metaWritesEnabled: () => true, supaConfigured: () => true },
    "@/lib/meta": {},
  });
  assert.equal((await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ level: "ad", id: "123", status: "ACTIVE" }) }))).status, 400);
});
