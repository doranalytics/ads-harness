# Chat with your ads harness in Codex or Claude Code

This is the **custom Ads Harness MCP**, backed by the harness's existing reporting API. It is not Meta's official MCP server. Meta remains a direct Graph/Marketing API connection inside the web app. The adapter also reads stored Apify organic data, so one chat can compare both.

It runs locally over stdio, opens no listening port, and only issues **GET /api/data**. There are no ad mutation, budget, campaign creation, token-writing or scraper/sync tools. No remote MCP endpoint is deployed.

## Demo setup: no credentials

Clone/install the starter with `npm ci`. Find its absolute folder path. Configure your client to run Node directly (do not use `npm run`, whose startup output can corrupt stdio):

```sh
codex mcp add ads-harness -- node /absolute/path/to/ads-harness/scripts/mcp-server.mjs
```

```sh
claude mcp add --transport stdio --scope local ads-harness -- node /absolute/path/to/ads-harness/scripts/mcp-server.mjs
```

These are instructions for your own machine, not commands the public lesson runs for you. Replace the path, including Windows drive/path syntax as appropriate. If your client cannot locate Node, use the absolute path to its executable. Restart/reconnect the client; use `/mcp` in Codex CLI or Claude Code to check tools. Codex app/IDE users can add the same **STDIO** command and arguments through their MCP settings.

By default this reads the public invented demo at https://ads-harness.vercel.app. To use your running local demo, set nonsecret `ADS_HARNESS_URL=http://localhost:3000` in the MCP server environment. Keep the dev server running. No Meta/Apify tokens or extra account grants are involved.

Codex config equivalent:

```toml
[mcp_servers.ads-harness]
command = "node"
args = ["/absolute/path/to/ads-harness/scripts/mcp-server.mjs"]
```

Claude Code config equivalent:

```json
{
  "mcpServers": {
    "ads-harness": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/ads-harness/scripts/mcp-server.mjs"]
    }
  }
}
```

See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp) and the [official MCP SDK guide](https://modelcontextprotocol.io/docs/develop/build-server).

## Live setup: separate read-only access, by your consent

The adapter never needs the Meta token, Apify token, Supabase key or owner `SESSION_TOKEN`. Those stay in the web app's server-side connector setup. It needs a **separate harness read-only credential** only if you decide to connect private live data.

Ask for explicit consent before generating or storing a persistent read credential. No credential is created by installation or by this repository. After you approve this specific access, generate your own random `MCP_READ_TOKEN` privately, set it in your own Vercel deployment/server environment and redeploy. It is accepted only by the reporting route, not by action or sync routes. Keep `META_WRITES_ENABLED=0` for reporting.

On your machine, create an ignored `.mcp.private.env` with:

```dotenv
ADS_HARNESS_URL=https://your-own-harness.example
ADS_HARNESS_READ_TOKEN=PASTE_YOUR_READ_ONLY_TOKEN_PRIVATELY
ADS_HARNESS_BUSINESS_PROFILE_FILE=/absolute/path/to/ads-harness/.business-profile.local.json
```

The profile line is optional. Restrict access to the private file. Never commit it or show it in chat. Change the client's Node arguments to:

```json
["--env-file=/absolute/path/to/ads-harness/.mcp.private.env", "/absolute/path/to/ads-harness/scripts/mcp-server.mjs"]
```

Do not put credentials in URLs, CLI arguments, checked-in `.mcp.json`, public Vercel variables or screenshots. Changing/removing `MCP_READ_TOKEN` revokes future adapter access. Because it has read access to your business reporting, only use a trusted local client and understand that requested data can be sent to that client's model provider.

## Tools and chart workflow

| Tool | What it reads |
| --- | --- |
| `get_overview` | Demo status, freshness, counts and saved automation state |
| `list_organic_posts` | Stored posts with original null/unknown values |
| `list_paid_ads` | Ad status and result labels; lifetime or selected daily date range |
| `get_paid_timeseries` | Chart-ready daily spend, results, cost/result and CTR; optional ad ID |
| `get_campaign_breakdown` | Campaign objective, aggregate metrics and mixed-result caveats |
| `get_connector_status` | Connection status, never credentials |
| `get_business_brief` | Confirmed local profile, or short discovery questions |
| `get_metric_definitions` | Event priority, attribution limits and chart guidance |

The `plan_business_dashboard` MCP prompt helps interview the business and plan charts. Tool data is cached reporting; asking a question does not run a paid scrape or sync Meta. To refresh, the owner uses the app's reporting Sync separately.

Start in chat with: “Use ads-harness to inspect freshness and result labels. Ask me what I sell, where I market, what outcome and events I track, which campaigns I run, and my budget/currency and success metric. Keep the questions brief. Summarize a dashboard and campaign plan for my confirmation. Do not launch anything.”

After confirmation, the coding assistant may save the nonsecret planning inputs in **`.business-profile.local.json`**, which is ignored by Git. Use `mcp/business-profile.example.json` and the exported schema in `mcp/analytics.mjs`. Unknown budget/CPA/ROAS remain null. A missing pixel/event stays a tracking gap; a planned purchase campaign is not evidence of purchases.

Then: “Use matching tracked events and attribution windows. Add a seven-day spend and cost-per-lead chart to my local harness, using actual MCP data to verify the totals. Keep missing values as unknown. Show demo labels if using sample data. Browser-check phone width. Keep live exported records out of public source.”

MCP supplies data; Codex/Claude Code edits the local app to build a new chart. Keep production charts reading the app's existing authenticated Snapshot/store, rather than pasting a private MCP response into code. Use per-ad time series to avoid blending unlike results. Do not invent ROAS without revenue data or infer target markets from sensitive personal characteristics. A campaign plan uses the markets/audiences the owner describes and waits for confirmation; it never changes spend.

Offline tests cover SDK tool discovery/calls, structured data, demo labeling, date validation, auth errors and absence of mutation tools. Live connector authorization is a separate owner verification step.
