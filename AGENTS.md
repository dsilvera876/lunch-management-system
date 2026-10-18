<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lunch Management System contributor guide

## Scope and architecture

- Treat the current code, migrations, and tests as authoritative. Keep changes focused; do not refactor
  unrelated code or add dependencies without explaining the need and obtaining approval.
- This is a strict-TypeScript Next.js 16 App Router application using React 19, Tailwind CSS 4, Supabase
  Auth/PostgreSQL/RLS/RPCs, and TypeScript workers. Preserve the established patterns in `src/app`,
  `src/components`, `src/lib`, and `src/worker` and the existing design tokens and shared components.
- For Next.js changes, read the relevant installed guide under `node_modules/next/dist/docs/`. Prefer
  Server Components and server actions where the surrounding feature does.
- Key references: `docs/user-account-lifecycle.md`, `docs/development-seed.md`,
  `tests/accessibility/README.md`, `deploy/STAGING.md`, and `deploy/AUTH_EMAIL.md`.

## Authorization and sensitive data

- The permanent roles are `staff`, `hr`, `accounts`, `admin`, and `owner`. Every active role may use the
  self-service lunch-ordering workflow for itself.
- Staff has authorized self-service access. HR owns employee management and HR operational workflows.
  Accounts owns financial operations, lunch periods, subsidies, exports, and its authorized employee-ID
  operations. Admin owns technical administration and authorized role management. Owner owns system
  governance and ownership management.
- Admin and Owner are not implicitly HR or Accounts. They may receive scoped, temporary, read-only HR or
  Accounts visibility only through an active Support Mode session. Support Mode must never authorize HR
  or Accounts mutations. Menu-rating administration requires a permanent HR role.
- Employee IDs are confidential. Access them only through existing explicitly authorized HR/Accounts
  operations; do not expose them in general user, support, logs, URLs, or client payloads.
- Enforce authorization in server code and PostgreSQL, never only by hiding UI. Preserve audit trails for
  sensitive operations, including role changes and ownership transfers.
- Never expose credentials, service-role keys, auth tokens, private environment values, or sensitive
  employee data. Do not log secrets or include them in fixtures, diffs, or reports.

## Database and business-rule safety

- Preserve RLS policies, grants, `SECURITY DEFINER` hardening, caller checks, restricted `search_path`s,
  and public/private schema boundaries. Add pgTAP regression coverage for database behavior or permission
  changes.
- Add forward-only files under `supabase/migrations`; never edit an applied migration without explicit
  approval. Preserve transaction safety, locking/concurrency behavior, idempotency, and worker claim/retry
  semantics.
- Never reset, truncate, seed, or destructively alter staging or production without explicit authorization.
  `npx supabase db reset --local` and destructive fixtures are local-only. Before any database command,
  identify the target environment; do not treat staging and production as interchangeable.
- Before production launch, all staging data is disposable. With explicit deployment authorization, a full
  reset of the **verified dedicated staging** Supabase project is allowed and is preferred when it makes a
  coordinated schema deployment safer or simpler; do not require backups or retention of test accounts
  solely for data preservation. Apply migrations only: never run the local development seed against hosted
  staging. Independently verify the exact project reference and that it is neither production nor a shared
  project before any remote reset. After production launch, preserve staging datasets and use
  non-destructive migration-regression testing instead of full resets.
- Do not change established rules without discussion and approval: Jamaica timezone/business calendars;
  ordering windows and cutoffs; late-order request/HR fulfillment; closure-driven declines; delivery
  reconciliation and state transitions; provider dispatch and order edits; period finalization and subsidy
  calculations; notification preferences, retries, and deduplication; or rating eligibility, verified
  delivery, and HR moderation.

## Accessibility

- Target WCAG 2.2 AA for Staff-facing work and prioritize independent ordering by visually impaired staff.
  Preserve keyboard flows and deliberate focus, accessible names/errors/status messages, dialog and form
  semantics, contrast, touch targets, responsive layout, and browser zoom behavior.
- Follow `docs/staff-accessibility-manual-checklist.md`. Playwright/axe coverage does not replace manual
  keyboard, NVDA, or other assistive-technology verification; never report those checks as passed unless
  they were actually performed.

## Testing and local development

- Inspect `git status -sb` before editing and choose checks proportional to the changed files. Add a
  regression test for a defect. Report passed, failed, skipped, and unexecuted checks separately, and call
  out known pre-existing failures rather than obscuring them.
- Common commands:
  - Development: `npm run dev`
  - TypeScript: `npx tsc --noEmit`
  - ESLint: `npm run lint`
  - Production build: `npm run build`
  - Repository unit suite used by staging checks: `npx tsx --test src/lib/*.test.ts`
  - Targeted TypeScript test: `npx tsx --test path/to/file.test.ts`
  - Local Supabase setup: `npx supabase start`, verify `npx supabase status` reports this project's local
    services, then `npx supabase db reset --local`
  - Local database pgTAP suite: `npx supabase test db --local`
  - Playwright accessibility/browser suite: `npm run test:a11y`
- Playwright defines Chromium and Firefox projects. Use the targeted project commands and prerequisites in
  `tests/accessibility/README.md`; its fixtures must refuse non-loopback databases. Some ordering scenarios
  depend on Jamaica weekdays or the documented simulated-weekday setup.
- Before local reset, pgTAP, or fixture commands, verify the configured API/database are loopback services
  (ports `55421`/`55422` in `supabase/config.toml`) and application environment URLs are not staging or
  production. Do not mutate staging data in automated tests unless explicitly authorized. Never describe
  unexecuted or skipped behavior as verified.

## Backlog, Git, and deployment

- Use `docs/reviews/prelaunch-review-backlog.md`; preserve IDs, severities, and status conventions. Update
  entries only when authorized work changes them, and require sufficient verification before resolving one.
  Recheck the file rather than assuming status: at the time of this guide, PRL-019 is resolved after the
  2026-10-15 staging verification, PRL-020 remains open, and Staff manual accessibility acceptance remains
  outstanding. Treat reported baseline test failures as needing reproduction and investigation.
- Do not overwrite unrelated changes. Review diffs for secrets, generated/debug artifacts, and unrelated
  files. Never amend, commit, push, deploy, or apply remote migrations without explicit authorization.
- Follow `deploy/STAGING.md` for staging validation, updates, rollback, workers, and smoke tests.

## Completion report

After implementation work, report: the change summary; files changed; affected business rules or permission
boundaries; tests and exact outcomes; limitations and remaining risks; final Git status; and whether anything
was committed, pushed, migrated, or deployed. Ask before work that changes authorization, security controls,
financial calculations, or established business rules.
