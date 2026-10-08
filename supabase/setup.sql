-- Fresh ads harness database: run once in your own Supabase SQL Editor.
-- Existing databases: apply only missing numbered migrations.

-- 0001_schema.sql
-- harness schema, in one file. Run it once in a new Supabase project
-- (SQL Editor → paste → Run), or `supabase db push` with the CLI.
--
-- Everything is read and written by the app's own API routes with the
-- service-role key. Row-level security is ON with zero policies, so the
-- public anon key can touch nothing — the browser never talks to Supabase.

-- The accounts the harness watches (Settings → roster).
create table if not exists accounts (
  id text primary key,                 -- "ig-" + handle
  platform text not null check (platform in ('x','instagram','tiktok','youtube','facebook')),
  handle text not null,
  label text not null default '',
  kind text not null default 'brand' check (kind in ('personal','brand'))
);

-- One row per post, as the last Apify scrape saw it.
create table if not exists posts (
  id text primary key,                 -- "ig-" + shortcode
  date date not null,
  account_id text not null references accounts(id) on delete cascade,
  title text not null,
  caption text not null default '',
  url text not null,
  format text not null default 'video',
  thumbnail_url text,                  -- our copy, in the `covers` bucket
  views bigint not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  reach bigint not null default 0,
  saves integer not null default 0,
  interactions integer not null default 0,
  boosted boolean not null default false,
  daily_budget numeric(10,2),
  ig_media_id text,                    -- Meta's media id; what a boost targets
  promotable boolean not null default true,
  promotable_reason text,
  synced_at timestamptz
);
create index if not exists posts_account_date on posts (account_id, date desc);
create index if not exists posts_ig_media_id on posts (ig_media_id);

create table if not exists daily_post_metrics (
  date date not null,
  post_id text not null references posts(id) on delete cascade,
  organic_views bigint not null default 0,
  paid_views bigint not null default 0,
  spend numeric(12,2) not null default 0,
  installs integer not null default 0,
  paid_installs integer not null default 0,
  primary key (date, post_id)
);

create table if not exists daily_account_metrics (
  date date not null,
  account_id text not null references accounts(id) on delete cascade,
  followers bigint not null default 0,
  primary key (date, account_id)
);

-- Where each number comes from, and whether that pipe is live.
create table if not exists connectors (
  key text primary key,
  name text not null,
  role text not null default '',
  status text not null default 'needs-keys' check (status in ('wired','needs-keys','planned')),
  summary text not null default '',
  unlocks text not null default '',
  needs text not null default ''
);

-- Write-only credentials (Settings → Connector keys). Never read back out
-- to a browser.
create table if not exists connector_secrets (
  connector text primary key references connectors(key) on delete cascade,
  fields jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

insert into connectors (key, name, role, status, summary, unlocks, needs) values
  ('meta-ads', 'Meta Ads', 'Paid spend + boosting', 'needs-keys',
   'Meta Marketing API, called straight from the app with a System User token. Syncs campaigns, ad sets, ads, spend and results daily and on Sync now; Promote runs an Instagram post as an ad.',
   'the Paid tab, Promote to paid, pause/resume and budgets',
   'Settings → Connector keys → Meta Ads. Step by step: docs/meta-business-setup.md'),
  ('apify', 'Apify', 'Organic performance', 'needs-keys',
   'Public Instagram scrape for the accounts in your roster: latest posts with views, likes and comments, plus follower counts. Daily, and on demand from Connectors.',
   'the Organic tab',
   'Apify API token, pasted in Settings → Connector keys'),
  ('appstack', 'AppStack', 'App install attribution (optional)', 'planned',
   'Only for businesses promoting a mobile app: installs and trials per Meta ad.',
   'cost per install, cost per trial',
   'AppStack MCP key + app id in Settings → Connector keys → AppStack')
on conflict (key) do nothing;

-- Post covers (Instagram's CDN urls expire, so the sync keeps a copy).
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- Meta ads
-- Raw Graph objects, append-only, so the rollups below can be rebuilt.
create table if not exists meta_raw (
  id bigserial primary key,
  pulled_at timestamptz not null default now(),
  level text not null,                 -- campaign | adset | ad | insight | insight_daily
  entity_id text not null,
  payload jsonb not null
);
create index if not exists meta_raw_entity on meta_raw (level, entity_id, pulled_at desc);

create or replace view meta_daily_insights with (security_invoker = true) as
select distinct on (entity_id) entity_id, pulled_at, payload
from meta_raw
where level = 'insight_daily'
order by entity_id, pulled_at desc, id desc;

create table if not exists campaigns (
  id text primary key,
  channel text not null default 'meta',
  name text not null,
  objective text,
  status text not null,
  effective_status text,
  daily_budget numeric(12,2),
  lifetime_spend numeric(12,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists adsets (
  id text primary key,
  channel text not null default 'meta',
  campaign_id text references campaigns(id) on delete cascade,
  name text not null,
  status text not null,
  effective_status text,
  daily_budget numeric(12,2),
  lifetime_budget numeric(12,2),
  optimization_goal text,
  billing_event text,
  promoted_pixel_id text,
  promoted_event text,
  publisher_platforms text[],
  device_platforms text[],
  user_os text[],
  created_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists adsets_campaign on adsets (campaign_id);

create table if not exists ads (
  id text primary key,
  channel text not null default 'meta',
  campaign_id text references campaigns(id) on delete cascade,
  adset_id text,
  adset_name text,
  name text not null,
  status text not null,
  effective_status text,
  -- the organic post this ad promotes (posts.id), when we know it
  source_post_id text references posts(id) on delete set null,
  preview_url text,
  thumbnail_url text,
  created_at timestamptz,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  results integer not null default 0,  -- the ad set's optimisation event
  results_label text,
  -- optional AppStack attribution
  installs integer not null default 0,
  trials integer not null default 0,
  purchases integer not null default 0,
  attribution_synced_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists daily_ad_metrics (
  date date not null,
  ad_id text not null references ads(id) on delete cascade,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  results integer not null default 0,
  installs integer not null default 0,
  trials integer not null default 0,
  purchases integer not null default 0,
  primary key (date, ad_id)
);

-- Optional AppStack report snapshot (one row, id = 'default').
create table if not exists appstack_cache (
  id text primary key,
  payload jsonb not null,
  synced_at timestamptz not null
);

alter table accounts enable row level security;
alter table posts enable row level security;
alter table daily_post_metrics enable row level security;
alter table daily_account_metrics enable row level security;
alter table connectors enable row level security;
alter table connector_secrets enable row level security;
alter table meta_raw enable row level security;
alter table campaigns enable row level security;
alter table adsets enable row level security;
alter table ads enable row level security;
alter table daily_ad_metrics enable row level security;
alter table appstack_cache enable row level security;


-- 0002_auto_off.sql
-- Auto-off: after an ad's first 7 days, the daily Meta sync pauses it when
-- its 7-day cost is over the limit. Run this once on an existing database
-- (SQL Editor → paste → Run); new projects run 0001 then this.

-- The rule (one row, id = 'default'). Off until someone turns it on.
create table if not exists auto_off (
  id text primary key default 'default',
  enabled boolean not null default false,
  cost_limit numeric(12,2),            -- dollars; also the alert line on the Paid tab
  updated_at timestamptz not null default now()
);

-- Every ad the rule paused, and the 7-day numbers it was judged on.
create table if not exists auto_off_log (
  id bigserial primary key,
  ad_id text not null references ads(id) on delete cascade,
  ad_name text not null default '',
  paused_at timestamptz not null default now(),
  spend numeric(12,2) not null,
  results integer not null,            -- results, or installs when AppStack is wired
  cost numeric(12,2),                  -- null when there were no results to divide by
  cost_limit numeric(12,2) not null
);
create index if not exists auto_off_log_ad on auto_off_log (ad_id, paused_at desc);

alter table auto_off enable row level security;
alter table auto_off_log enable row level security;


-- 0003_auto_off_restart.sql
-- Preserve a new seven-day observation period when an ad resumes.
alter table ads add column if not exists auto_off_started_at timestamptz;


-- 0004_connector_copy.sql
-- Clarify paused-first behavior without replacing an owner's connector status.
update connectors set
  summary = 'Meta Marketing API, called directly with a System User token. Sync reads campaigns, ad sets, ads, spend and results. When live actions are enabled, Promote creates a PAUSED ad from an eligible owned Instagram post in an existing ad set. Activation requires confirmation.',
  unlocks = 'Paid reporting; optional paused drafts, confirmed activation and budget changes'
where key = 'meta-ads';
