-- Preserve a new seven-day observation period when an ad resumes.
alter table ads add column if not exists auto_off_started_at timestamptz;
