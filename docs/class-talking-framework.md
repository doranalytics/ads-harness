# How to AI 301: instructor guide

Friday, October 9, 2026. 30 minutes of teaching and building, then 30 minutes of Q&A.

Class page: https://ai301-ads-recipe.vercel.app

Public template: https://github.com/doranalytics/ads-harness

Shared sample app: https://ads-harness.vercel.app

## What the class should leave with

A working local or deployed demo, one useful change, and a clear next connection step. Students should understand the decision they want to make, the event they actually track, and the source behind each number. Live Meta authorization is a follow-up milestone, not a prerequisite to completing the lesson.

## The hour at a glance

| Minutes | Teach or demonstrate | Checkpoint |
| --- | --- | --- |
| 00-03 | Start with a business question | One decision, stated plainly |
| 03-07 | Interview the business | Confirm goal, event and primary metric |
| 07-12 | Install and inspect the demo UI | Working screen and visible sample badge |
| 12-18 | Apify organic / Meta paid evidence | Explain engagement versus conversion |
| 18-24 | MCP chat and a custom chart | Read data, choose matching outcomes |
| 24-30 | GitHub / Vercel and next step | Own copy, demo URL, next checkpoint |
| 30-60 | Q&A and selective troubleshooting | Resolve the first blocked boundary |

## Before the room opens

Open the recipe page, the shared demo, a clean local demo and the GitHub template. Keep private live-account windows closed. Test Wi-Fi, the copy control and a phone view. Have students sign into GitHub and Vercel and install Node LTS if they want a local app. A coding assistant needs local file access. Students without one can still deploy the sample in the browser.

Keep a downloaded recipe and this guide as backup. Never screen-share a token or an environment-variable value. Use the invented coffee-brand examples. No live ad activation, budget change or paid scrape is part of the public demonstration.

The simplest backup is the public demo. If an authentication or permissions screen takes two minutes without a clear next step, name the missing prerequisite, switch back to the sample, and continue. Do not spend the class improvising broader permissions.

<!-- pagebreak -->

## 00-03: start with a business question

Say: “I can see my posts in one place and my ads in another. Which post deserves a paid test? When should I stop that test? Today we start from a working tool and use AI to make it useful for our own business.”

Ask: “What is one marketing decision you currently make from a spreadsheet or by jumping between tabs?” Take two brief examples. Write down the decision, not a feature wish list.

Show Organic and Paid. Point at the demo badge: “These are invented examples. We can learn the interface without connecting an account or spending money.”

## 03-07: interview before choosing the chart

Use three short, adaptive questions. Follow up only on a gap that changes the next step.

1. What do you sell, who buys it, and which markets/geographies or audiences do you already serve or want to test?
2. What outcome do you want: awareness, visits, leads, sign-ups, purchases or installs? Which events are actually tracked, and is the pixel/dataset or other tracking verified?
3. What campaigns do you run or plan, what budget/currency are you considering, and how do you judge success? CPA/ROAS targets and attribution windows can be unknown.

Have the assistant summarize the offering, described markets, objective, tracked events, campaign types, budget/currency, primary metric, targets if known and attribution window. Confirm a small dashboard and campaign plan before building it.

Say: “A lead and a purchase are different outcomes. If Purchase is not measured, we have a tracking gap, not a purchase performance chart. If revenue is absent, we cannot manufacture ROAS. You do not need to invent a target just to fill the form.”

After confirmation, save nonsecret planning inputs in the ignored .business-profile.local.json using the supplied example/schema. Keep the business plan out of public commits. The profile guides views and new charts; it does not launch campaigns or grant access. Target markets come from the owner; the starter does not measure geographic/audience breakdowns.

## 07-12: get a working screen

Students open the class page and copy the full recipe into Codex or Claude Code. Begin with demo installation only. Use GitHub Desktop or Download ZIP for students who do not use Git. Node 22.13+ is enough; npm ci installs the starter and npm run demo opens it.

Say: “Do not solve Meta permissions before you have a working screen. Can you open the app and see the demo badge?”

Checkpoint: Organic, Paid and Settings load. If local setup is blocked, use Deploy your demo and the GitHub/Vercel browser flow with NEXT_PUBLIC_DEMO=1. No business tokens are needed.

Rescue lines: “Check that the folder contains package.json.” “If port 3000 is busy, use npm run demo -- --port 3001.” “Reopen the terminal after installing Node.” “The sample buttons explain the action; they send nothing.”

<!-- pagebreak -->

## 12-18: show the evidence behind the numbers

Explain the pieces: “Apify fetches public post information. Meta supplies paid reporting. Supabase remembers the records. The harness is where we read them. GitHub stores the source. Vercel serves the running app. The coding assistant changes the code.”

Point at the hierarchy: campaign gives the objective; ad set owns audience and usually budget; ad contains the creative. The starter creates a paused ad inside an existing ad set. It does not create the advertising account, campaign or audience.

### Engagement is not conversion

Views, likes and comments describe attention and response to a post. They do not prove leads, sales or profit. Public Instagram counts may include paid engagement and do not reveal the full organic/paid split. Missing views, shares or saves remain unknown.

Conversions are defined events: Lead, CompleteRegistration, Purchase or an install, for example. Confirm which event is measured and what attribution window gives it credit. A seven-day-click report and a one-day-view report are not automatically comparable.

The starter chooses the first recognized Meta action: purchase, lead, registration, install, then link click. Show the result label before reading cost per result. A link-click cost is not a purchase CPA. A revenue-free result count is not ROAS.

### Two connection lanes

Apify needs its API token and a public Instagram handle. It does not need the Instagram password or a Meta app for the public scrape. The starter requests profile followers and the latest 50 posts per channel. Actor runs can cost money; check usage/pricing before Sync.

Meta reporting needs an assigned ad account and an access token. Instagram promotion additionally needs the linked professional Instagram/Page assets. The System User token route asks the owner to select a Meta app. The harness needs no app ID/secret env pair, but that does not remove the Meta app step. Other advertisers' assets can involve advanced access, verification and App Review.

Show environment-variable names only, with a blank connector form. Keep META_WRITES_ENABLED=0. Manual Sync reads Meta reporting and never changes its status or budget.

### Demonstrate the control without spending

Promote creates a PAUSED draft from an eligible owned post in an existing ad set. Inspect the audience, destination and budget in Ads Manager. Resume requires confirmation and may spend the existing budget. Meta eligibility, parent status and review still matter.

Auto-off starts off and requires two opt-ins: the deployment write gate and the saved rule. After an ad's first seven days, daily automation evaluates seven complete UTC dates. It pauses when pooled cost exceeds the limit, or spend exceeds it with no results. Manual Sync never runs it. This is not a real-time spend cap.

| Seven-day spend | Results | Cost/result | Limit 20 | Reading |
| --- | --- | --- | --- | --- |
| 80 | 8 | 10 | 20 | Below limit |
| 80 | 2 | 40 | 20 | May pause when rule is enabled |
| 21 | 0 | unknown | 20 | Spend without results can trigger a pause |
| 0 | 0 | unknown | 20 | Nothing to judge |

<!-- pagebreak -->

## 18-24: use MCP chat to build the missing chart

Configure the custom Ads Harness MCP in Codex or Claude Code using docs/mcp-setup.md. Use the public sample and no credential. It runs locally over stdio, reads the combined stored reporting and exposes eight read-only tools. It is not Meta's official MCP server. Meta remains the app's Graph/Marketing API connection.

Say: “MCP lets the assistant ask the harness for data. The assistant can then edit our local app to build a chart. Reading the data is separate from changing the ad account.”

Prompt: “Use ads-harness to inspect freshness and metric definitions. Ask me the short business questions. Summarize a dashboard plan for my confirmation. Do not launch anything.”

Then: “Inspect the ad result labels. Show the last seven days for a comparable ad, then add a matching spend and cost-per-result chart to my local dashboard. Check totals against the actual tool output. Keep unknowns visible and sample labels on.”

Use get_overview, get_metric_definitions and get_business_brief first, list_paid_ads to pick a comparable event, and get_paid_timeseries for chart-ready dates. The MCP prompt plan_business_dashboard supports the interview workflow. Do not blend unlike outcomes to make a tidy chart.

MCP does not sync providers, run paid scrapers, create campaigns, activate ads or change budgets. Production charts should read the authenticated Snapshot/store, not hardcode a private MCP export. Live private access requires a separately consented read-only MCP_READ_TOKEN and an ignored local env file. No such credential is created by installing the starter.

## 24-30: give each student their own copy

Show GitHub → Use this template, then Vercel → Add New → Project → Import Git Repository. The Deploy demo shortcut creates the student's own repository and project. Keep NEXT_PUBLIC_DEMO=1. The public source is the recipe for the app; the deployment is one running copy. Tokens and private business records never belong in the source.

Have one student ask for a small improvement: “Use my business name. Make the result label and unknown values readable on a phone. Show the change and check Organic and Paid still work.”

Say: “A good request names the decision, the user and what success looks like.” Replace “make it better” with “at phone width I can read the event and tell when data is missing.” Review the changed file and the rendered screen.

Checkpoint: working local/deployed sample, one useful change and a next step. Let students identify their stage: demo, public posts, Meta reporting or inspected paused draft. Live permissions can take longer. A blocked connector does not erase the progress.

<!-- pagebreak -->

## 30-60: Q&A and selective troubleshooting

Use the first ten minutes for questions about the tool and metrics, the next ten for setup gaps, and the last ten for one student chart/change and next steps. Follow the room's actual questions rather than completing every connector.

Resolve the first broken boundary: UI → app route → provider → database → response. A permission error is an access gap; do not hide it with invented data. If authentication stalls for two minutes, state the missing asset/permission and return to the sample. Student enters secrets privately in the app/provider UI; no public screen-share of token values.

### Answers to keep short

- Do I need a Meta app? For this System User token route, yes. The harness receives the token/asset IDs, not an app ID/secret env pair.
- Is this Meta MCP? Our custom Ads Harness MCP reads the harness's combined reporting. It is not Meta's official server. The web app calls Graph/Marketing API directly.
- Does it create campaigns? No. It reads campaigns and can create PAUSED ads inside a configured existing ad set after live actions are enabled.
- Can I begin with no accounts? The sample needs no business account. Live public posts need Apify and a public handle; owned Instagram ads need assigned assets and token permissions.
- What if tracking is missing? Show the gap. Use attention/traffic metrics for what is actually measured; verify the conversion event before using CPA/ROAS.
- How should I choose a market? Start with the markets/audiences the owner describes and the offer's constraints. Make a proposal and confirm it. Do not infer sensitive traits or claim geographic results this starter does not fetch.
- Will it guarantee profitable ads? No. Attribution, reporting delays, objective choice and the business's economics still matter.
- Is hosting free? Terms/quotas apply. Vercel Hobby is personal/non-commercial; choose a plan permitted for the use. Apify runs and actual ads may cost money.
- Can everyone share Brian's live account? Use the public invented demo. Each business creates its own copy and connects its own assets privately.

### Close with one concrete next step

Ask: “What decision will you use this for this week, and which missing piece is your next checkpoint?” Invite a demo URL or a description of the change, without private account data.

Say: “You do not need every connector today. You need a working tool, one useful change and an understanding of where the numbers come from.”

Give the class page and Meta checklist. Ask students to use their copy once this week and note the decision it helped them make and the data they still could not trust.

## Verification boundary for teaching

The published lesson and MCP are verified in sample mode, with offline provider mocks and an official SDK client. Live Meta/Apify integration must be verified by the owner of the student's assets. No real ad approval, spend, live mutation or paid scrape is demonstrated by these tests.
