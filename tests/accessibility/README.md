# Staff accessibility E2E (Phase D)

Automated Playwright + axe regression tests for the **Staff** experience only.

## Prerequisites

1. Local Supabase with development seed:
   ```bash
   npx supabase db reset
   ```
2. `.env.local` with **loopback-only** Supabase API URL (`http://127.0.0.1:55421` or `http://localhost:55421` — see your `supabase/config.toml` API port). Remote/staging hosts are **refused** for fixture mutation.
3. Staff E2E credentials (never commit passwords):
   - `E2E_STAFF_EMAIL` — e.g. `staff1@lunch.test` from `docs/development-seed.md`
   - `E2E_STAFF_PASSWORD` — matching local seed password
4. Optional: `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3000`)

Playwright starts `npm run dev` automatically unless a server is already running.

## Local ordering fixture (global setup / teardown)

Before tests, Playwright runs `global-setup.ts`, which uses **`npx supabase db query --local --output-format json --agent no`** (Postgres on localhost only — not the Supabase HTTP API host) to guarantee self-service ordering is open for **Jamaica today** when today is **Mon–Fri**. Requires Supabase CLI **≥ 2.116.0** so human terminals and CI get JSON, not pretty-table output.

Authoritative guards mirrored in app/DB logic:

| Guard | Fixture approach |
|--------|------------------|
| `order_cutoff_time` / deadline | Temporarily set to `23:59:00`; restored from snapshot |
| Weekend / holiday / closure (`is_business_day`) | Insert **manual** `override_open` calendar rows (global + staff1 location if needed); remove on teardown |
| `is_order_date_in_finalized_period` | Temporarily set matching `lunch_periods.status` from `finalized` → `open`; restore original status |
| `iso_weekday` (Sat/Sun) | **Not bypassed** — setup fails fast on Jamaica weekend |

Snapshot file: `tests/accessibility/.auth/e2e-ordering-fixture-snapshot.json` (gitignored). Teardown restores **original values**, not seed defaults.

**Temporarily changed (when needed):**

- `public.app_settings.order_cutoff_time`
- `private.business_calendar_entries` — fixture UUIDs `00000001-e2e0-…` / `00000002-e2e0-…`; may archive one prior active override per scope
- `public.lunch_periods.status` for any **finalized** period covering Jamaica today

## Run

```bash
npm run test:a11y
```

**Menu item ratings (weekend-safe):** skips the open-ordering calendar fixture (same pattern as Most Popular). Uses `/home` and `/my-orders` only; the lunch-menu case is skipped.

```bash
$env:PLAYWRIGHT_MENU_ITEM_RATINGS_ONLY="1"
npx playwright test tests/accessibility/menu-item-ratings.spec.ts --project=chromium-menu-item-ratings-a11y --project=firefox-menu-item-ratings-a11y
npx playwright test tests/accessibility/hr-menu-item-ratings.spec.ts --project=chromium-hr-ratings-a11y --project=firefox-hr-ratings-a11y
```

### Open-ordering checks on a weekend (simulated weekday)

The `iso_weekday` guard cannot be bypassed in the database, so on a Jamaica weekend open-ordering specs
(`staff-checkout-a11y`, `staff-keyboard`, `staff-pages`, `staff-full-page`, `staff-reflow`, `firefox-smoke`)
run against a **separate local production server** that simulates an upcoming weekday. No database dates,
cutoff, calendar or period rows are changed.

- `helpers/simulated-jamaica-today.cjs` is preloaded into `next start`. It shifts only `America/Jamaica`
  date formatting of instants within ten minutes of the real clock, by whole days (at most seven), so the
  server's "Jamaica today" becomes the chosen date. `Date.now()` is untouched, so sessions, database `now()`
  and the real order deadline still apply. It refuses to load unless `NEXT_PUBLIC_SUPABASE_URL` is loopback
  and `E2E_SIMULATED_JAMAICA_TODAY_PRELOAD=1` is set.
- The specs inject the same patch into the browser (`helpers/simulated-weekday.ts`) so client-rendered dates
  match the server and hydration succeeds. Without `E2E_SIMULATED_JAMAICA_TODAY` this is a no-op.
- `PLAYWRIGHT_SIMULATED_WEEKDAY=1` swaps global setup for `global-setup-simulated-weekday.ts`, which makes no
  changes and fails unless ordering is already open locally for the chosen date (staff1's location and no
  location).

```powershell
# 1. Build and start the simulated server (separate terminal; the dev server on :3000 can keep running)
npm run build
$env:E2E_SIMULATED_JAMAICA_TODAY="2026-10-12"   # an upcoming open weekday
$env:E2E_SIMULATED_JAMAICA_TODAY_PRELOAD="1"
$env:NODE_OPTIONS="--require=./tests/accessibility/helpers/simulated-jamaica-today.cjs"
npx next start -p 3100

# 2. Run the specs (another terminal, without NODE_OPTIONS)
$env:PLAYWRIGHT_BASE_URL="http://localhost:3100"
$env:PLAYWRIGHT_SIMULATED_WEEKDAY="1"
$env:E2E_SIMULATED_JAMAICA_TODAY="2026-10-12"
npx playwright test --project=chromium-checkout-a11y --project=firefox-checkout-a11y
npx playwright test --project=chromium-a11y --project=firefox-smoke --workers=1
```

Limits: the browser's own clock is still real, so countdown text reflects the true time to the deadline.
Database functions that read `jamaica_today_date()` (for example late-order eligibility) still see the real
date. Confirm open-ordering behaviour on a real weekday before release.

`staff-checkout-a11y.spec.ts` places one real local order as staff1 to verify the success confirmation and
deletes it in `afterEach` (loopback DB only). Its missing-location case signs in as `staff3@lunch.test`
(override with `E2E_NO_DEFAULT_STAFF_EMAIL`), unticks "Save as my default delivery location", and asserts the
profile still has no default afterwards.

Fixture unit/integration tests (no browser):

```bash
npx tsx --test tests/accessibility/helpers/e2e-ordering-fixture.test.ts tests/accessibility/helpers/e2e-ordering-fixture.integration.test.ts
```

## CI recommendation

Run on a **weekday** Jamaica time, loopback Supabase, after `npx supabase db reset`. Do not point `NEXT_PUBLIC_SUPABASE_URL` at staging/production for `test:a11y`.

## Seed fixtures

Route IDs: `helpers/seed-fixtures.ts` (from `supabase/seeds/development.sql`).

Tests do not send email or mutate HR/account configuration. The only spec that places an order is
`staff-checkout-a11y.spec.ts`, which deletes it afterwards (see above).

## Late-order drawer scans

`staff-late-order-drawer.spec.ts` runs in the **chromium-late-order-a11y** project after all **chromium-a11y** tests finish, so shared DB cutoff/provider changes do not overlap open-ordering tests. Exact pre-test DB values are written to `.auth/late-order-drawer-restore.json` and restored in `afterAll` (including on failure), independent of the open-ordering snapshot file.

## Manual checks

See `docs/staff-accessibility-manual-checklist.md`. A green `test:a11y` does not prove full WCAG compliance.
