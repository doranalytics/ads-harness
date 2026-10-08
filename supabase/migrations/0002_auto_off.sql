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
