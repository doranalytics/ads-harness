-- Clarify paused-first behavior without replacing an owner's connector status.
update connectors set
  summary = 'Meta Marketing API, called directly with a System User token. Sync reads campaigns, ad sets, ads, spend and results. When live actions are enabled, Promote creates a PAUSED ad from an eligible owned Instagram post in an existing ad set. Activation requires confirmation.',
  unlocks = 'Paid reporting; optional paused drafts, confirmed activation and budget changes'
where key = 'meta-ads';
