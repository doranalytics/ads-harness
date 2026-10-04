# Agent notes

Read `README.md` for what this app is and how it's set up.

## Rules

- **Never invent a number.** If a connector isn't set up, show an empty
  state or "—" and point at Settings. A zero is a measurement; a dash means
  unknown.
- **The Snapshot shape is a contract.** `lib/types.ts` → `Snapshot` is what
  `app/api/data/route.ts` serves and what every screen reads. Change one,
  change the other, and the schema in `supabase/migrations/` (add a new
  numbered migration; don't edit 0001 once a database exists).
- **No account-specific values in code.** Ad account, ad set, Page, link and
  tokens come from Settings (`connector_secrets`) with `META_*` env
  fallbacks — see the header of `lib/meta.ts`.
- **Secrets never reach a browser.** Keys go browser → `/api/connector-keys`
  → `connector_secrets` and are never read back through the app.
- **Charts are hand-rolled SVG** in `components/charts.tsx`; colours in
  `lib/types.ts` (`CHART`). Organic is cyan, paid is violet. No chart
  libraries.
- **Promote creates live ads that spend money.** Don't change what
  `createPostAd` does (live, in the configured ad set, the post as creative)
  without the owner asking.

## Checks before you push

```
npm run lint
npx tsc --noEmit
npm run build
```
