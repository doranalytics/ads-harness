# How to AI 301: class talking framework

Friday, October 9, 2026 • 60-minute core, with an optional 30-minute connector clinic.

Class page: https://ai301-ads-recipe.vercel.app

Public starter: https://github.com/doranalytics/ads-harness

Shared demo: https://ads-harness.vercel.app

## What students should leave with

A working local ads harness, a GitHub copy and an optional Vercel demo URL. They should be able to ask an AI to make one useful change, explain where the numbers come from, and name the prerequisites for live data. Live Meta authorization is a follow-up milestone, not something every student must finish during class.

## Before opening the room

Open the recipe page, the public demo, a clean local demo and the GitHub starter. Keep a private live-account window closed during the public walkthrough. Test Wi-Fi, the copy button and a 375px phone view. Have students sign into GitHub and Vercel and install Node LTS if they want to run locally. Use a coding assistant with local file access. Students without one can still deploy a demo in the browser.

Keep a backup downloaded recipe and this framework. Never screen-share a token, environment-variable value or provider credential screen. Use example handles and invented demo data while teaching.

## 0–5 minutes: start with the decision

“Most of us can see our posts in one place and our ads in another. The question I want to answer is: which post deserves a paid test, and when should I stop that test? Today we will start from a working tool and use AI to make it useful for our own business.”

Ask: “What is one marketing decision you currently make from a spreadsheet or by jumping between tabs?” Invite two brief examples. Write down the decision, not a feature wish list.

Show Organic and Paid in the demo. Point at the **demo** badge: “These are invented examples. We can learn the interface without connecting an account or spending money.”

## 5–12 minutes: explain the four pieces

Use the simple path on the recipe page: **Instagram → Apify → harness → Meta reporting**.

“The harness is the place we read and act. Apify fetches public post information. Meta supplies paid performance. Supabase remembers the records. GitHub stores the code. Vercel serves the app. The coding assistant changes the code; it is not secretly the ad account.”

Show the hierarchy: campaign → ad set → ad. The campaign gives the objective. The ad set owns the audience and usually the budget. The ad contains the creative. The starter creates a paused ad inside an existing ad set; it does not create the whole advertising account or campaign.

Ask: “Which part of this chain would you check if a number looked wrong?” Take one answer and trace it to its source.

## 12–23 minutes: everyone gets a first win

Have students open the recipe page and **Copy full recipe** into their coding assistant. Ask them to begin with only the demo install. Give the ZIP/GitHub Desktop route to students who do not use Git. Keep the terminal path to `npm ci` and `npm run demo` visible.

“Don't solve Meta permissions before you have a working screen. First, can you open the app and see the demo badge?”

Checkpoint: Organic, Paid and Settings load locally. If Node or a local assistant is unavailable, use the page's **Deploy your demo** button and the GitHub/Vercel browser flow. Keep `NEXT_PUBLIC_DEMO=1`. No tokens are needed.

Common rescue lines:

- “Check which folder the terminal is in. It should contain package.json.”
- “If 3000 is busy, use `npm run demo -- --port 3001`.”
- “Reopen the terminal after installing Node.”
- “The demo buttons explain what they would do. They do not save or send anything.”

## 23–35 minutes: make a small change with AI

“A good request says what you want to decide, who uses it and how you will know it worked.”

Use this example: “Change the header to my business name. Keep the demo badge. Make cost per result easier to understand on a phone. Show me the change and check that Organic and Paid still work.”

Let students choose one small change. Walk one student through the assistant's plan, the changed file and the rendered screen. Ask them to describe the behavior in ordinary language before discussing implementation.

Have the assistant ask a short business interview: offering/customer/markets; desired outcome and actually tracked events; existing/planned campaigns, budget/currency, success metric and attribution window. It should summarize a metric and campaign plan for confirmation. A student who tracks leads needs a different primary chart from one who tracks purchases. If Purchase or revenue is not measured, label the tracking gap and avoid invented CPA/ROAS targets. Save confirmed nonsecret planning inputs locally in the ignored business profile; the interview does not authorize launching ads.

Show why “make it better” is hard to verify. Replace it with “At phone width I can read the result label and tell when data is missing.” Test that exact thing. Keep source changes small enough to review.

## 35–43 minutes: make the app shareable

Open GitHub's **Use this template** and Vercel's project import UI. Explain the optional Deploy Button shortcut creates the student's own copy and project. The source can be public; the live business data and credentials must not be.

“A repository is the recipe for the app. A deployment is one running copy of it. You can share the demo URL without handing out your business account.”

After deploying, open the public URL on a phone. Make one visible edit in the student's repository and explain that the linked Vercel project builds that commit. Don't teach students to paste secrets into GitHub source.

## 43–51 minutes: connect data honestly

Make two columns on the board: **public Instagram** and **owned Meta Ads**.

“Apify needs its API token and a public handle. It does not need your Instagram password. Runs may cost money and some public metrics will be missing. This cannot tell us the complete organic-versus-paid split.”

“Meta reporting needs permission to the business assets and an access token. For the System User route, Meta asks you to choose an app when issuing the token. The app identity is part of authorization. This starter doesn't ask for an app ID or app secret in its environment, but that doesn't remove the Meta app step.”

Explain owned-business permissions versus building a service for other advertisers: the latter can involve advanced access, business verification and App Review. Menus and eligibility vary. Students blocked here still have a useful demo and a clear checklist.

Show the environment-variable **names**, never their values. Explain the difference between `NEXT_PUBLIC_BRAND_NAME` and a server-only token. Show the Settings connector form blank. Reading data does not require enabling the starter's live write gate.

## 51–57 minutes: paid decisions and a pause-first workflow

“Promote makes a paused draft from an eligible owned post. It uses an existing ad set. You inspect the audience, destination and budget in Ads Manager, then Resume asks you to confirm. That activation can spend money.”

Point at cost per result and the result label. “A purchase and a link click are different outcomes. The starter picks recognized reported actions in a fixed order; it doesn't make every campaign comparable.”

Teach the seven-day rule with invented numbers:

| Seven-day spend | Results | Cost/result | Limit 20 | Outcome after initial seven days |
| --- | --- | --- | --- | --- |
| 80 | 8 | 10 | 20 | Keep running |
| 80 | 2 | 40 | 20 | May pause if automation is enabled |
| 21 | 0 | unknown | 20 | May pause because spend exceeds the limit without results |
| 0 | 0 | unknown | 20 | Nothing to judge |

“There are two opt-ins: live ad actions in the deployment and the saved auto-off rule in Paid. Both start off. Manual Sync only refreshes reporting. The daily automation uses the last seven complete UTC dates after an ad's first seven days. It is not a real-time spend cap.”

Do not demonstrate a real activation or paid scrape during the public lesson. Discuss the confirmation in the demo or use the screenshots, with the demo badge visible.

## 57–60 minutes: one concrete next step

Ask students to paste their URL or describe their local change, without account data. Have them say which stage they reached: local demo, deployed demo, real public posts, Meta reporting, or reviewed paused draft.

“You don't need every connector today. You need a working tool, one useful change and an understanding of where each number comes from. Your next task is the first unfinished stage in your own copy.”

Give the recipe and Meta checklist links. Ask for a practical follow-up: “Use the tool once this week. Write down the decision it helped you make and the data you still couldn't trust.”

## Optional 30-minute connector clinic

You can replace part of the clinic with a chat demonstration. Configure the custom Ads Harness MCP in Codex or Claude Code using `docs/mcp-setup.md`, with the public demo and no credential. Ask `get_overview`, then inspect `list_paid_ads` result labels, then request a seven-day per-ad series. Ask the coding assistant to add a matching chart to a local copy. Explain: MCP reads the data; the assistant edits the chart. It is our custom local adapter, not Meta's official server, and it has no mutation/sync tools. Live access would require a separately consented read-only credential and private configuration.

Use private breakout help for Supabase schema/env setup (10 minutes), Apify roster/token/usage controls (10 minutes), and Meta asset/app/token troubleshooting (10 minutes). Student enters secrets directly. Keep reporting mode on. If permissions are unavailable, record the exact missing permission or asset and stop that connection step. Do not improvise broader authorization or account/spend changes.

## Answers worth keeping short

- **Do I need a Meta app?** For this System User token route, yes. The harness itself only receives the token and asset IDs; it needs no app ID/secret env pair.
- **Is this Meta MCP?** The web app calls Graph/Marketing API directly. We provide our own Ads Harness MCP so Codex/Claude Code can read its combined organic/paid data and build charts. It is not Meta's official server.
- **Does it build my campaigns?** No. It reads campaigns and creates paused ads inside a configured existing ad set.
- **Can I use it with no Instagram account?** Yes, the demo needs no accounts. Live Apify needs a public handle. Creating your own ads needs owned, assigned professional Instagram/Page assets.
- **Can it guarantee profitable ads?** No. It organizes reported data and provides controls. Attribution, objectives, reporting delays and business economics still matter.
- **Can I host it for free?** The demo needs no data-service subscription, but hosting terms and quotas apply. Choose a Vercel plan permitted for your use; commercial use is outside Hobby terms. Apify runs and actual ads can cost money.
- **Can everyone share Brian's live account?** Use the public demo. Each business creates its own copy and privately connects its own accounts.

## Teaching verification boundary

The published lesson is verified in demo mode plus offline tests. Meta and Apify live integration must be verified by the owner of the student's assets. Never describe mocked tests as proof that an actual account is connected or an ad was approved.
