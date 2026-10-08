import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSnapshotReader, paidAds, timeSeries, businessProfileSchema } from "../mcp/analytics.mjs";
import { loadTs } from "./load-ts.mjs";

const snapshot = loadTs("lib/demo.ts", {}, { process: { env: { NEXT_PUBLIC_DEMO: "1" } } }).demoSnapshot([]);
test("stdio starts through an absolute symlink path used by client configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ads-mcp-entry-"));
  const entry = join(directory, "server.mjs");
  const client = new Client({ name: "symlink-launch-test", version: "1.0.0" });
  try {
    await symlink(resolve("scripts/mcp-server.mjs"), entry);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], stderr: "pipe" }));
    assert.equal((await client.listTools()).tools.length, 8);
    assert.equal((await client.listPrompts()).prompts[0].name, "plan_business_dashboard");
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});
test("read token only authorizes reporting, never an action route", () => {
  const s = loadTs("lib/server.ts", {}, { process: { env: { MCP_READ_TOKEN: "offline-read-only", SESSION_TOKEN: "different-owner-token" } } });
  const req = new Request("http://localhost", { headers: { authorization: "Bearer offline-read-only" } });
  assert.equal(s.reportingAuthorized(req), true);
  assert.equal(s.authorized(req), false);
  assert.equal(s.cronAuthorized(req), false);
});
test("reader makes only authenticated GET, rejects credentials in URLs and redacts errors", async () => {
  let seen;
  const read = createSnapshotReader({ baseUrl: "https://example.com", token: "offline-read-token", fetchImpl: async (url, init) => { seen = { url: String(url), init }; return Response.json({ configured: true, snapshot }); } });
  assert.equal((await read()).demo, true);
  assert.equal(seen.url, "https://example.com/api/data");
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers.Authorization, "Bearer offline-read-token");
  assert.throws(() => createSnapshotReader({ baseUrl: "https://user:secret@example.com" }), /without credentials/);
  assert.throws(() => createSnapshotReader({ baseUrl: "http://example.com" }), /HTTPS/);
  const denied = createSnapshotReader({ fetchImpl: async () => new Response("private", { status: 401 }) });
  await assert.rejects(denied(), /Reporting access denied/);
});
test("date filtering and chart data preserve outcomes and demo labeling", () => {
  const rows = timeSeries(snapshot, { adId: snapshot.ads[0].id });
  assert.equal(rows.demo, true);
  assert.equal(rows.inventedData, true);
  assert.ok(rows.rows.length > 0);
  const date = rows.rows[0].date;
  assert.equal(timeSeries(snapshot, { adId: snapshot.ads[0].id, from: date, to: date }).rows.length, 1);
  const ads = paidAds(snapshot, { from: date, to: date, limit: 100 });
  assert.equal(ads.rows[0].scope, "requested dates in stored daily reporting");
  assert.equal(ads.rows[0].resultLabel, "purchase");
});
test("business schema keeps unknown targets null and strips unrelated secret fields", () => {
  const data = businessProfileSchema.parse({ business: "Example", offering: "Example", objective: "leads", targetMarkets: ["Owner described region"], trackedEvents: [], trackingReady: "unknown", campaignTypes: [], currency: "USD", dailyBudget: null, primaryMetric: "lead", targetCpa: null, targetRoas: null, attributionWindow: "unknown", token: "must-be-stripped" });
  assert.equal(data.targetCpa, null);
  assert.equal(data.token, undefined);
});
test("real SDK stdio discovers eight read-only tools and queries the demo over HTTP", async () => {
  const requests = [];
  const http = createServer((req, res) => {
    requests.push({ path: req.url, method: req.method });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ configured: true, snapshot }));
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = http.address().port;
  const client = new Client({ name: "offline-teaching-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["scripts/mcp-server.mjs"], cwd: process.cwd(), env: { ADS_HARNESS_URL: `http://127.0.0.1:${port}` }, stderr: "pipe" });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 8);
    assert.ok(tools.every((t) => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
    assert.ok(tools.every((t) => !/promote|sync|activate|budget|pause/.test(t.name)));
    for (const name of ["get_overview", "list_organic_posts", "list_paid_ads", "get_paid_timeseries", "get_campaign_breakdown", "get_connector_status", "get_metric_definitions", "get_business_brief"]) {
      const result = await client.callTool({ name, arguments: {} });
      assert.ok(!result.isError, `${name} returned an error`);
      assert.ok(result.structuredContent);
      if (name === "get_overview") assert.equal(result.structuredContent.demo, true);
    }
    const invalid = await client.callTool({ name: "get_paid_timeseries", arguments: { from: "2026-10-08", to: "2026-10-01" } });
    assert.equal(invalid.isError, true);
    const prompts = await client.listPrompts();
    assert.equal(prompts.prompts[0].name, "plan_business_dashboard");
    assert.ok(requests.length > 0);
    assert.ok(requests.every((r) => r.path === "/api/data" && r.method === "GET"));
  } finally { await client.close(); await new Promise((resolve) => http.close(resolve)); }
});
