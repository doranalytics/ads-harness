# How to AI 301: build your ads harness

Friday, October 9, 2026. Start with a working demo, make it yours, then connect your own data.

Copy this whole recipe into a coding assistant that can work with local files, such as Codex or Claude Code. Keep this page open for the GitHub, Vercel and connector steps.

## The job

Help me install and personalize the public ads harness at https://github.com/doranalytics/ads-harness. It is a Next.js app for comparing Instagram posts with Meta ad performance. Use the existing starter rather than rebuilding it from scratch.

Work in small steps. Inspect the project and its AGENTS.md first. Explain what each step gives me. Ask one question at a time when an answer affects the next step. Proceed with local, reversible work. Guide me through account and credential screens myself. Do not create accounts, accept terms, buy anything, run paid scrapes or activate ads on my behalf.

Keep the first installation in demo mode. The demo contains invented coffee-brand examples, requires no tokens and sends nothing to Meta, Apify or Supabase. Never substitute demo numbers for live numbers. Do not paste tokens into chat, commits, screenshots, URLs or client-side code. Tell me where to paste a secret privately in the app or the provider's environment-variable form.

## 1. Get a working local app

If I already opened the starter folder, use it. Otherwise guide me to GitHub → the repository → **Use this template → Create a new repository**, choose a name, and save it in my own GitHub account. Public source is fine; business credentials and private data never belong in the repository. I can choose a private copy for my business.

For a local copy, I can use GitHub Desktop → **File → Clone repository**, or GitHub → **Code → Download ZIP**, unzip it, and open that folder in the coding assistant. If Git is already installed, use:

```sh
git clone https://github.com/doranalytics/ads-harness.git
cd ads-harness
npm ci
npm run demo
```

Check Node.js first. Use Node 22.13 or newer; an active Node LTS is appropriate. If it is missing, guide me to https://nodejs.org and its installer for my operating system, then reopen the terminal. Do not require Docker, a database or a Vercel CLI for the demo.

Run the install in the project folder. `npm run demo` starts at http://localhost:3000 with demo mode forced on and live Meta actions off. If the port is occupied, use `npm run demo -- --port 3001` and give me that URL. Open the app and verify Organic, Paid, Connectors and Settings. A visible demo badge must remain. A demo button must explain that it sends nothing rather than pretending to save a change.

Do not ask me for any business tokens before this checkpoint. Success: I can open the local demo and explain what a post, an ad, an ad set and a campaign are.

## 2. Make one useful change

Ask for my business name and the decision I want this tool to help me make. Use `NEXT_PUBLIC_BRAND_NAME` for the name and keep the existing navigation and data contract. If I ask for a UI change, implement one small change first, check it at desktop and phone width, and show it to me.

Keep the business interview short and adaptive. Begin with three questions, then ask only for gaps relevant to my goal:

1. What do I sell, who buys it, and which markets/geographies or audiences do I already serve or want to test?
2. What outcome do I want: awareness, visits, leads, sign-ups, purchases or installs? Which actual events are tracked, and is the pixel/dataset or other conversion tracking verified?
3. What campaigns do I run or plan, what budget/currency am I considering, and how do I judge success? CPA/ROAS targets and attribution windows may be unknown.

Summarize my offering, described markets, objective, tracked events, campaign types, currency/budget, primary metric, target CPA/ROAS if known, and attribution window. Propose a small dashboard and campaign plan for my confirmation. Leads, registrations and purchases are distinct outcomes. If conversion tracking or revenue is absent, show that gap rather than manufacturing conversions, ROAS or a target. Do not infer sensitive audience traits or auto-launch based on this interview.

After I confirm, save these nonsecret planning inputs in the ignored `.business-profile.local.json`, following `mcp/business-profile.example.json` and the schema in `mcp/analytics.mjs`. Unknown targets/budget remain null. Keep my private business plan out of a public commit. Use it to select the relevant views and charts. The starter does not fetch geographic/audience breakdowns; described target markets guide a plan, not a claim of measured audience performance.

Suggested first request: “Make the tool feel like my business. Keep the demo badge. Improve the explanation of cost per result so I can tell whether a post is worth trying as an ad.”

Never invent live measurements. Public Instagram data may have missing views, shares or saves. A dash means unknown; zero means measured zero. Apify public counts do not prove how much traffic was organic rather than paid. The harness's Meta “results” are the first recognized action it finds: purchase, lead, registration, install, then link click. Check the result label and Ads Manager before comparing ads with different objectives. The current currency display uses dollar formatting and budget conversion assumes two decimal minor units; verify the ad account currency before using live budgets.

## 3. Put my demo on Vercel using the UI

Easiest route: open the README's **Deploy demo** button. Sign into GitHub and Vercel, let the flow create my repository/project, and keep `NEXT_PUBLIC_DEMO=1`. The button contains only public configuration. Choose my own account/team and deploy. I need no Supabase, Apify or Meta account for this version.

If I already made a GitHub copy: Vercel dashboard → **Add New → Project → Import Git Repository** → select my copy. Framework: Next.js. Root directory: repository root. Add `NEXT_PUBLIC_DEMO` with value `1`, then **Deploy**. Leave live action variables unset.

Open the resulting production URL on desktop and phone. Check the demo badge, Organic and Paid, and confirm no real account data appears. GitHub changes deploy through the connected repository. This lesson's separate recipe is https://ai301-ads-recipe.vercel.app and its shared demo is https://ads-harness.vercel.app.

## 4. Prepare a private live data connection

This is optional after the class demo. Only continue when I choose to connect my own business. This starter has a shared owner password, not individual user accounts or a client onboarding/OAuth flow. Use it for a business I control.

Create my own Supabase project in its dashboard. Open **SQL Editor → New query** and run the complete `supabase/setup.sql` once in a fresh database. For an existing harness database, apply only missing numbered files in `supabase/migrations/`; do not rerun the fresh schema over it.

In Vercel → my project → **Settings → Environment Variables**, set the following for Production. For local live use, put the same names in an ignored `.env.local`. Do not copy Brian's deployment credentials or pull his environment.

| Name | What I provide |
| --- | --- |
| `APP_PASSWORD` | A strong password I choose for this app |
| `SESSION_TOKEN` | A separate random secret, at least 32 random bytes |
| `SUPABASE_URL` | My project's URL from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | My server-only `sb_secret_…` key, or legacy `service_role` JWT; never an anon/publishable key |
| `CRON_SECRET` | Another separate random secret, at least 32 random bytes |
| `NEXT_PUBLIC_BRAND_NAME` | Optional business name, safe to show publicly |
| `META_WRITES_ENABLED` | `0` for reporting; only set `1` later if I explicitly choose ad actions |

Help me generate session/cron secrets locally into an ignored private file if needed; do not print them into the conversation. Remove `NEXT_PUBLIC_DEMO` (or set it to `0`) and redeploy. This build-time setting changes only after a new build. `npm run demo` deliberately stays demo even if live secrets exist; use `npm run dev` for a local live session. Use private local previews, not a publicly shared tunnel containing live credentials.

Verify the sign-in screen appears, an incorrect password fails, and the correct password opens empty states. Verify unauthenticated `/api/data` returns 401 and live ad actions are off. Connector tokens are saved server-side by Settings and are never returned to the browser. Supabase RLS blocks anonymous table access; the service key bypasses RLS and must stay server-side. Copied post thumbnails use a public covers bucket, so only connect public content appropriate to store there.

## 5. Connect public Instagram data through Apify

I need an Apify account and a public Instagram handle. I do not need to give the harness an Instagram password or connect a Meta app for the Apify scrape.

In Apify Console → **API & Integrations**, create a token for this integration. A personal API token works; a scoped token must permit the actors to run and their output storage to be read. The Instagram actors used by this starter are `apify/instagram-profile-scraper` and `apify/instagram-scraper`. Actor runs can incur Apify charges; check the actor pricing and my usage limit before I press Sync. Other platforms in the starter are optional and use other actors.

In my harness → **Settings**, add my Instagram account to the account roster without the `@`. In **Connector keys → Apify**, paste the token privately and save. Then **Connectors → Apify → Sync now**. The starter requests the latest 50 posts per channel plus profile followers. Public data availability can change and some fields will be missing.

Verify my handle and real posts appear in Organic. If the scrape fails, inspect the Apify run and the app's error; never hide failure by inserting sample data. Environment fallback: `APIFY_TOKEN`, server-only.

## 6. Connect Meta Ads reporting

This harness calls Meta's Graph/Marketing API directly. It does not use Meta MCP or the coding assistant's Meta connector. It has no Facebook Login OAuth onboarding. The default API version is `v26.0`, configurable with server-only `META_GRAPH_VERSION`; check Meta's current supported Marketing API versions if requests fail.

Required pieces: my Meta Business portfolio, an ad account, a Facebook Page, a professional Instagram account linked to that Page, and permission to assign those assets. For promoting posts I also need an existing campaign and ad set with a suitable objective, audience, budget, placement and billing setup. The harness creates ads inside that ad set; it does not create campaigns/ad sets, install a pixel, upload new creative or decide an audience.

**A Meta app is part of token issuance.** Meta's System User token flow asks me to select an app connected to my business. Create/select an app with a Marketing API use case in Meta for Developers, associate it with my portfolio, then use **Business settings → Users → System users** to create an appropriate system user and assign the app, ad account, Page and Instagram assets. Generate its access token. Use the expiration choices Meta actually offers; tokens can be revoked or invalidated even if no expiry is chosen.

For reporting the code needs `ads_read` and access to my ad account. Ad creation/control needs `ads_management`; the Page/Instagram identity and owned-media lookups need the applicable `business_management`, `pages_show_list`, `pages_read_engagement` and `instagram_basic` permissions for this Facebook Login based route. Grant only the applicable permissions for my chosen scope. If the permissions are unavailable, stop and inspect the app's use case/access level instead of pretending an app secret fixes it. Serving other businesses may require advanced access, business verification and App Review; do not promise review-free setup or instant approval. This app does not require `META_APP_ID` or `META_APP_SECRET` environment variables.

Paste the token and ad account ID privately in **Settings → Connector keys → Meta Ads**. A bare numeric ID or `act_…` works. Save, then **Connectors → Meta Ads → Sync now**. Confirm campaign, ad set and ad names, spend, dates and result labels against Ads Manager. Leave `META_WRITES_ENABLED=0`. Sync reads Meta; it never activates or pauses ads or changes budgets. Do not copy a token into a terminal command URL or chat.

See `docs/meta-business-setup.md` for the asset and permission checklist. No token has been tested against Brian's real ad account as part of this teaching starter.

## 7. Optional paused ad drafts and automation

Only continue when I explicitly choose live ad actions. In Settings → Meta Ads, also provide my existing ad set ID, Page ID, destination link and CTA such as `LEARN_MORE`. Check the matching Instagram identity, audience, budget and destination in Ads Manager. Then set `META_WRITES_ENABLED=1` on my deployment and redeploy.

In Organic, choose an eligible post I authored and **Promote**. Read the dialog and choose **Create paused ad**. Existing-post creative preserves the post identity; Meta can reject posts with licensed audio, collaboration ownership or other eligibility restrictions. Open **Paid → Paused** and inspect the draft in Ads Manager. **Resume** asks for confirmation and can spend the existing budget once approved. Changing a daily budget also asks for confirmation. A paused parent campaign/ad set can prevent delivery even if the ad is active.

Auto-off is a separate choice, initially off. It only works when the write gate is on, I set a positive cost limit, and I explicitly switch its saved rule on in Paid. The daily `/api/automation` job first refreshes 14 days of Meta reports, then may pause active ads after their first seven days. It judges total spend divided by total recognized results over the last seven complete UTC dates. With no results, total spend above the limit triggers a pause. It never raises budgets or restarts ads. Freshness, missing data and incomplete attribution checks skip unsafe judgments. An observed restart receives a fresh seven-day period. The log records each automatic pause.

Turning auto-off off prevents future pauses; setting `META_WRITES_ENABLED=0` disables every Meta action. Manual Sync stays reporting-only even when automation is on. Vercel schedules daily jobs around 07:00 UTC; Hobby timing can vary within the hour. This is a daily control, not a real-time spend cap. Use Ads Manager's own budget/account controls for that.

## 8. Verify and hand it back

### Optional: talk to the harness through MCP

Install the **custom Ads Harness MCP** using `docs/mcp-setup.md`. It is not Meta's official MCP server. It runs locally over stdio and reads the harness's stored organic/paid reporting; it exposes no ad actions, sync or paid scraper tools. The default connection queries only the public invented demo and needs no credential.

For Codex: `codex mcp add ads-harness -- node /absolute/path/to/ads-harness/scripts/mcp-server.mjs`. For Claude Code: `claude mcp add --transport stdio --scope local ads-harness -- node /absolute/path/to/ads-harness/scripts/mcp-server.mjs`. Replace the path and reconnect the client. Use the same direct Node command in Codex's STDIO MCP settings if using the app/IDE. Do not run configuration commands for me until I request installation.

Begin with `get_overview`, `get_metric_definitions` and `get_business_brief`. Ask the short business questions above, confirm the metric/campaign plan, then use `list_paid_ads` result labels and `get_paid_timeseries` for comparable outcomes. Ask: “Add a seven-day chart for my confirmed primary metric to my local harness. Check it against actual stored data, keep unknowns visible and show it on a phone.” MCP provides data; the coding assistant builds the chart in the existing project. Production charts should read the authenticated Snapshot/store, not a hardcoded private MCP export.

Live private reporting requires a separately consented `MCP_READ_TOKEN` on my server and `ADS_HARNESS_READ_TOKEN` in an ignored local `.mcp.private.env`. Ask explicitly before generating/storing this persistent credential. Never use my Meta/Apify/Supabase tokens or the owner SESSION_TOKEN as the MCP credential. The read token is accepted only by the reporting route. Follow the private Node env-file setup in `docs/mcp-setup.md`; no tokens go in URLs, command arguments or shared configuration. No account scope is automatically granted and no protected reporting is published by the starter.

### Final checks

For changes, run `npm run lint`, `npm run check`, `npm test` and `npm run build`. Inspect browser console/errors, desktop and 375px phone layouts. Check the first broken boundary in order: UI → app route → provider → database → response. Do not call live Meta writes or paid scrapers to test the starter without my separate explicit instruction.

Before committing, check tracked files and staged diff for secrets, real account IDs and private scraped data. Keep `.env.local`, `.vercel`, logs and verification screenshots out of Git. Commit source only, push to my repository when requested, then verify the connected Vercel deployment. Tell me what changed, what was tested, the local and public URLs, and any connector prerequisites still blocked. Do not claim real Meta/Apify integration passed if only the demo or mocked tests passed.

## Reference links

- [Starter and install instructions](https://github.com/doranalytics/ads-harness)
- [Meta access tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens)
- [Meta System Users](https://developers.facebook.com/docs/business-management-apis/system-users/overview/)
- [Meta Marketing API app use cases](https://developers.facebook.com/documentation/development/create-an-app/marketing-api-use-cases)
- [Apify API token and scopes](https://docs.apify.com/integrations/api)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Vercel Deploy Button variables](https://vercel.com/docs/deploy-button/environment-variables)
- [Vercel cron limits and timing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel plans](https://vercel.com/docs/plans) (choose a plan permitted for your use; Hobby is for personal, non-commercial use)
