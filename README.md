# ads harness — Instagram → Meta ads, one feed

A small web app for running a business's Instagram and its Meta ads from one
place:

- **Organic** — your Instagram posts as a grid: cover, views, likes,
  comments, engagement. Every post has a **Promote to paid** button that runs
  that exact post as a Meta ad. No re-upload, so its likes and comments carry
  over. Once a post is running you see its spend, cost per result and a
  14-day cost trend right on the card, and can sort the feed by them.
- **Paid** — your Meta ad account: campaign → ad set → ad, with spend,
  CPM, CTR, results and **cost per result** for any date range. Each ad shows a
  7-day cost line with an alert line you set: days over it turn red. You can
  pause or resume any campaign, ad set or ad, and set ad set budgets, without
  opening Ads Manager.
- **Connectors** — whether each data source is live, with a Sync button.
- **Settings** — your Instagram handle and the keys for each connector.

It's a Next.js app on **Vercel** with its data in **Supabase**. There is no
server of your own to run: Vercel Cron runs the daily syncs, and every
button calls Meta or Apify directly from the app's API routes.

## See it first: the demo

Set one environment variable, `NEXT_PUBLIC_DEMO=1`, and the app runs with no
password and an invented coffee-roaster account: posts, ads, costs and red
alert days. Nothing is sent anywhere, and a **demo · sample data** badge stays
in the header. To put it online, import the repo in Vercel (**Add New →
Project**), add `NEXT_PUBLIC_DEMO` = `1`, and deploy. No other setup needed.
Locally: `NEXT_PUBLIC_DEMO=1 npm run dev`.

For a real deployment, leave `NEXT_PUBLIC_DEMO` unset.

## What you need

| | What for | Cost |
|---|---|---|
| **Vercel** account | hosts the app, runs the daily syncs | free plan works |
| **Supabase** project | the database | free plan works |
| **Apify** account | reads your public Instagram posts and numbers (the Organic tab) | pay per result; the free monthly credit covers light use |
| **Meta Business** setup | the Paid tab and the Promote button | your ad spend |

**You do not need to log in to Instagram through the app.** The Organic tab
reads your public profile through Apify, the way a visitor would. That's why
it has views for reels but not for image or carousel posts, and no reach or
saves: Instagram doesn't make those public.

**Meta:** the Paid tab and Promote use a System User token from your Meta
Business account. Meta asks you to pick an app when you create that token,
so you'll make one basic app along the way. It takes two minutes, needs no
review, and you never touch it again.
[docs/meta-business-setup.md](docs/meta-business-setup.md) walks through it
step by step.

**AppStack** (`lib/appstack.ts`) is optional and only for businesses
promoting a **mobile app**. With it connected, the Paid tab leads with cost
per install and cost per trial instead of cost per result. Otherwise ignore
it: nothing runs until it has keys.

## Set it up (about 30 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste all of
   [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql), **Run**.
3. **Project Settings → API**: copy the **Project URL** and the
   **service_role** (secret) key for step 2.

### 2. Vercel

1. Push this repo to your GitHub, then **Add New → Project** in Vercel and
   import it.
2. Before deploying, add the environment variables from
   [`.env.example`](.env.example): the five **required** ones
   (`APP_PASSWORD`, `SESSION_TOKEN`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`), plus `NEXT_PUBLIC_BRAND_NAME`
   if you want your name on it.
3. Deploy. Open the site and sign in with `APP_PASSWORD`.

### 3. Your Instagram account

**Settings → Accounts → Add account**: platform Instagram, your handle
without the @, then **Save roster**. The account has to be public.

### 4. Apify (the Organic tab)

1. Sign up at [apify.com](https://apify.com), then **Settings → API &
   Integrations** and copy your **Personal API token**.
2. In the app: **Settings → Connector keys → Apify**, paste it, **Save**.
3. **Connectors → Apify → Sync posts + followers.** The first run takes a
   minute or two. After that it runs on its own every morning.

Each sync reads the latest 50 posts per account (`POSTS_PER_CHANNEL` in
`lib/apify.ts`). Apify charges per result, so lower that number to spend
less.

### 5. Meta (the Paid tab and Promote)

Follow [docs/meta-business-setup.md](docs/meta-business-setup.md). At the end
you paste six things into **Settings → Connector keys → Meta Ads**:

| Field | What it is |
|---|---|
| Access token | the System User token |
| Ad account id | `act_…` |
| Promote ad set id | the ad set every Promote lands in; it holds the budget |
| Facebook Page id | the Page your Instagram is connected to |
| Ad link | where the ad sends people: your site, shop or booking page |
| Button | the call-to-action: `LEARN_MORE`, `SHOP_NOW`, `SIGN_UP`, `BOOK_NOW`… |

Then **Connectors → Meta Ads → Sync now**. The Paid tab fills in, and
**Promote to paid** works on every post.

## How Promote works

Pressing **Promote to paid** on a post:

1. finds the post's media id in your Instagram account through Meta,
2. creates an ad creative from **that existing post**, with your link and
   button,
3. creates the ad **live** in your promote ad set. It starts once Meta
   approves it (usually minutes), and shares the ad set's daily budget.

Collabs authored by another account, and posts using licensed music, can't
run as ads. The card then says **Not promotable** and why.

## What "cost per result" means

Meta counts one **result** per conversion of whatever your ad set optimises
for: a purchase, a lead, a sign-up. The app takes the first of these that
Meta reports for an ad:

purchase → lead → complete registration → app install → link click

That order is `RESULT_ORDER` in `lib/meta-sync.ts`; reorder it if your
business counts something else first. **Cost per result = Meta spend ÷
results.** For it to mean "cost per sale", the ad set has to optimise for
purchases and your site needs the Meta pixel (see the setup doc).

## Syncs

| | When | Route |
|---|---|---|
| Meta | daily 07:15 UTC + **Sync now** | `/api/meta/sync` |
| Apify | daily 07:00 UTC + Connectors → Sync | `/api/apify/sync` |
| AppStack (optional) | daily 07:25 UTC; skips itself if not set up | `/api/appstack/sync` |

The schedules are in `vercel.json`. Vercel's free plan allows one run per
day per job; on Pro you can make Meta hourly (`"15 * * * *"`).

## Develop locally

```
npm install
cp .env.example .env.local   # fill in the required values
npm run dev                  # http://localhost:3000
```

`npm run assets` redraws the icons and share card. Change the colour in
`scripts/make-icons.mjs` and `--primary` in `app/globals.css`.

## Layout

```
app/organic, app/paid, app/connectors, app/settings   the four screens
app/api/*            server routes: data, promote, meta/sync, meta/control,
                     apify/sync, appstack/sync, accounts, connector-keys, unlock
lib/meta.ts          Meta Graph calls + where the Meta settings are read
lib/meta-sync.ts     Meta → Supabase sync
lib/apify.ts         Apify scrapes → Supabase
lib/cost.ts          cost per result / per install, per day
lib/types.ts         the Snapshot shape every screen reads
supabase/migrations  the schema
docs/                setup guides
```

## Safety

- One password at the door. Nothing is visible without it.
- Keys you save in Settings go straight to Supabase (`connector_secrets`),
  readable only with the service role key, and are never sent back to a
  browser.
- Row-level security is on for every table with no public policies. The
  browser never talks to Supabase directly; only the app's server routes do.
- Promote creates **live** ads that spend from the ad set's budget. Keep that
  budget at a level you're comfortable with.
