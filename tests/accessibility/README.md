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

Before tests, Playwright runs `global-setup.ts`, which uses **`npx supabase db query --local`** (Postgres on localhost only — not the Supabase HTTP API host) to guarantee self-service ordering is open for **Jamaica today** when today is **Mon–Fri**.

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

Fixture unit/integration tests (no browser):

```bash
npx tsx --test tests/accessibility/helpers/e2e-ordering-fixture.test.ts tests/accessibility/helpers/e2e-ordering-fixture.integration.test.ts
```

## CI recommendation

Run on a **weekday** Jamaica time, loopback Supabase, after `npx supabase db reset`. Do not point `NEXT_PUBLIC_SUPABASE_URL` at staging/production for `test:a11y`.

## Seed fixtures

Route IDs: `helpers/seed-fixtures.ts` (from `supabase/seeds/development.sql`).

Tests do not place orders, send email, or mutate HR/account configuration.

## Late-order drawer scans

`staff-late-order-drawer.spec.ts` runs in the **chromium-late-order-a11y** project after all **chromium-a11y** tests finish, so shared DB cutoff/provider changes do not overlap open-ordering tests. Exact pre-test DB values are written to `.auth/late-order-drawer-restore.json` and restored in `afterAll` (including on failure), independent of the open-ordering snapshot file.

## Manual checks

See `docs/staff-accessibility-manual-checklist.md`. A green `test:a11y` does not prove full WCAG compliance.
