# Lunch Management System — Bugbot security review

Use this document when reviewing diffs for **correctness and security**. Ignore style, naming, and formatting unless they directly enable a vulnerability.

## System context (ground truth)

- **Stack:** Next.js App Router, React Server Components, **server actions** (`"use server"`), Supabase (Postgres + Auth), background **workers** (`src/worker/run.ts`) using **service role** via `createServiceClient()` (`src/lib/supabase/service.ts`, `SUPABASE_SECRET_KEY` in server env only).
- **Roles (permanent):** `staff`, `hr`, `accounts`, `admin`, `owner` — defined in `public.profiles.role` and mirrored in TypeScript (`src/lib/roles.ts`). **Admin/Owner are not HR or Accounts** unless using **Support Mode** (read-only, scoped).
- **Authorization layers (all must align for mutations):**
  1. **UI:** route/sidebar guards (`canAccessHrToolsRoute`, `canAccessAccountsAdminRoute`, Support Mode `readOnly` via `useSupportMode()`).
  2. **Server:** `require*` helpers in `src/lib/auth.ts` (e.g. `requireMutateHrOperationalData`, `requireMutateAccountsOperationalData`, `requireManageRoles`).
  3. **Database:** RLS on `public.*` tables + **`private.can_*()`** helpers in migrations; mutating RPCs must re-check authorization.
- **Support Mode:** `private.support_sessions`, RPCs `get_support_session_status`, helpers `private.can_view_hr_operational_data()` / `private.can_manage_hr_operational_data()` (and Accounts analogs). **View** may include Admin/Owner with active scoped session; **manage** is **HR or Accounts role only** — never Admin/Owner via support.
- **Worker boundary:** `private.is_worker_service_caller()` / `private.assert_worker_service_caller()` — worker-only RPCs must not be callable by `authenticated` users without this check.
- **Sensitive schemas:** `private.*` (notifications, email queue, support sessions, templates) — revoked from broad roles; access via SECURITY DEFER RPCs only.
- **Provider email (today):** Supplemental late orders use **direct SMTP** (`src/lib/late-order-supplement-dispatch.ts`) + `provider_late_order_dispatches`; **no primary daily provider sender** yet. Catalog event `provider.daily_order_summary` is not wired to a sender.

When reviewing a change, trace **data flow**: browser → server action / route → Supabase client (user JWT vs service) → RLS / RPC → side effects (email, queue, audit).

---

## 1. Authorization / role boundaries

**Permanent role model**

| Capability | Intended holders |
|------------|------------------|
| HR operational read/write (orders, providers, deliveries, late orders, cutoff, staff accounts) | **`hr` only** (mutate); Admin/Owner **read via Support Mode `hr` scope only** |
| Accounts operational (periods, finalize, subsidies, exports, employee IDs with Accounts rules) | **`accounts` only** (mutate); Admin/Owner **read via Support Mode `accounts` scope** |
| Governance (roles, auth/email settings, support sessions) | **`admin`, `owner`** |
| Staff self-service | **`staff`** — own profile, own orders, own financial views as implemented |

**Flag CRITICAL/HIGH when:**

- Authorization exists **only in client components** (hiding buttons) but server actions, route handlers, or RPCs omit equivalent checks.
- Server uses **`requireHrOperationalRead` / `requireViewAllOrders`** (or Accounts read guards) for a **mutation**.
- **`canMutateHrOperationalData` / `canMutateAccountsOperationalData`** is bypassed by checking `canAccessAdminDashboard`, `is_admin_or_owner()`, or Support scope for writes.
- **Support Mode** allows mutation: any RPC using `can_view_*` or `can_view_lunch_operations()` for INSERT/UPDATE/DELETE paths; Admin/Owner gaining `can_manage_*` without permanent HR/Accounts role.
- Support session treated as **permanent role** (e.g. role checks that read `support_sessions` instead of `profiles.role` for mutate paths).
- **Caller-controlled IDs:** `profile_id`, `user_id`, `order_id`, `provider_id`, `dispatch_id`, `lunch_period_id` from client used without verifying the caller may act on that resource (staff accessing another staff member’s orders/financials).
- **TypeScript vs Postgres mismatch:** e.g. TS allows Admin to a route that RPC rejects — less severe if RPC wins; **TS allows mutation that RPC/RLS allows incorrectly** is HIGH.
- **Staff** paths returning other users’ PII, orders, subsidies, or employee IDs.

**Support Mode requirements (regression checks):**

- Sessions: time-bounded, audited (`private.support_sessions`), scope `hr` | `accounts` only.
- Status helpers must stay **read-only** (see `20260930150000_support_mode_readonly_status_helpers.sql` — no writes from status RPCs).
- UI `readOnly` is **not sufficient**; every mutating server action must use **`requireMutateHrOperationalData`** or **`requireMutateAccountsOperationalData`** (or governance guards), and DB must use **`can_manage_*`**, not **`can_view_*`**.

**Key files:** `src/lib/auth.ts`, `src/lib/roles.ts`, `src/lib/support-mode*.ts`, `supabase/migrations/*support*`, `supabase/migrations/20260906140000_add_roles_and_permissions.sql`, `20260930120000_admin_support_sessions.sql`, `20260930140000_support_mode_rls_read_policies.sql`.

---

## 2. Supabase / Postgres security

**Review every new or changed:**

- **RLS:** enabled on exposed tables; policies use `private.can_*()` not raw role strings; **SELECT** policies may use `can_view_*`; **INSERT/UPDATE/DELETE** must use **`can_manage_*`** (or tighter).
- **Missing RLS** on new `public` tables.
- **Overly broad policies** (`using (true)`, `authenticated` without capability check).
- **SECURITY DEFINER** functions: mandatory **`set search_path = ''`**; explicit authorization at start; no trust of unvalidated caller-supplied role/identity.
- **GRANT EXECUTE:** `authenticated` should not execute worker-only or admin-only RPCs; prefer **`service_role`** only for worker entrypoints after `assert_worker_service_caller()`.
- **Public schema exposure:** tables in `public` reachable with anon/authenticated; **`private` schema** tables should remain revoked except via definer RPCs.
- **Direct table writes** from app bypassing RPCs when RLS is weak or policies were loosened “for convenience”.
- **Service role:** `createServiceClient()` bypasses RLS — any code path invoking it from request handlers without strict internal authorization is CRITICAL.

**SECURITY DEFINER red flags:**

- Uses `auth.uid()` or JWT claims without confirming active, non-inactive profile.
- Accepts `p_profile_id` / `p_user_id` and operates on that user without ownership or HR/Accounts check.
- Dynamic SQL with unescaped user input.
- Missing `revoke all ... from public` on new private helpers.

**Key patterns:** migrations under `supabase/migrations/`, pgTAP tests in `supabase/tests/*security*`, `*_hardening*.sql`.

---

## 3. Authentication / account security

**Review:**

- **Signup / approval:** HR-controlled signup, invite idempotency, domain rules — bypass of approval or activation.
- **Inactive accounts:** `account_status = 'inactive'` must block session/profile use (`getCurrentProfile` returns null); auth hooks and RPCs must enforce consistently.
- **Password reset / magic links:** Supabase Auth flows; no custom endpoints leaking tokens.
- **Auth hooks** (`src/lib/mail/process-auth-send-email-hook.ts`, migrations): verify signature/service role; no user-triggered hook bypass.
- **Privilege escalation:** profile `role` updates only via governed RPCs (`update_manageable_user_profile`, etc.); staff cannot self-promote.
- **Enumeration:** distinguish intentional UX (login errors) vs leaking approval state in APIs.

---

## 4. Secrets / configuration

**Flag CRITICAL:**

- `SUPABASE_SECRET_KEY`, SMTP passwords, or hook secrets in client bundles, `"use client"` modules, or **`NEXT_PUBLIC_*`** (allowed public vars: Supabase URL + publishable key only — see `src/lib/supabase/client.ts`).
- Secrets in logs, error messages, client-visible stack traces, or email failure payloads.
- Committed `.env`, keys in tests/seeds committed to public repos.
- Unsafe fallbacks (default service key, “dev” credentials in production paths).

**Expected:** server-only `src/lib/env/server.ts`; workers and server actions only; SMTP via server mail layer (`src/lib/mail/*`).

---

## 5. HR / financial data

**Sensitive data:** employee names, emails, employee IDs, order history, spend/subsidies, lunch period summaries, approval/signup metadata, delivery issues, HR notes.

**Flag:**

- Cross-user leakage in queries (missing `.eq('profile_id', ...)` or RPC scope).
- **Broad selects** exposed to client components (`select('*')` on profiles/orders/financials).
- Financial summaries visible to **staff** beyond self-scope (check `canViewFinancialSummaries` vs `canViewAllFinancialSummaries`).
- PII in URLs, analytics, console logs, or outbound email beyond product intent.
- **Accounts** data visible without `can_view_accounts_operational_data()`.

---

## 6. Ordering / business-logic integrity

**Authoritative rules live in Postgres** (not only UI):

- Ordering deadline: `order_deadline_for_order_date`, `app_settings.order_cutoff_time`, self-service deadline RPCs.
- Late orders: company cutoff + `provider_late_order_deadline_at`; snapshot integrity migrations.
- Period finalization: `finalize_lunch_period` — **Accounts only**; no mutations after finalize without explicit RPC.
- Business calendar: closed days block ordering paths.

**Flag:**

- Client-only deadline enforcement.
- Race conditions: duplicate orders, double dispatch, double finalize, concurrent claims without advisory locks (supplement uses `pg_advisory_xact_lock` — new dispatch/finalize code should match).
- Mutations after cutoff/finalize/deadline bypassing DB helpers.
- Partial success (email sent but DB not updated, or vice versa) where business state becomes inconsistent.

**Normal ordering and period finalization must never depend on SMTP success.**

---

## 7. Provider email / dispatch security

**Current supplemental path:** `claim_provider_late_order_supplement` / worker claim → `executeSupplementalDispatch` → `finalize_*_provider_late_order_supplement`.

**Flag HIGH/CRITICAL:**

- Wrong **recipient** (not `lunch_providers.primary_order_email` for claimed provider).
- **Cross-provider leakage:** order IDs from another provider in same email; query missing `provider_id` / `lunch_days.provider_id` filter.
- **Cross-delivery-date** mixing in one dispatch.
- **Duplicate sends:** retry after `sent` without idempotency; `attention_required` retry without HR acknowledgement flow.
- **Stale `pending`:** missing lease sweep (`worker_sweep_stale_pending_dispatches`).
- **Ambiguous SMTP** not mapped to `attention_required` vs hard failure.
- Including **extra PII** beyond approved provider workflow (employee names in supplements are **intentional** — do not flag as vulnerability).

**Future primary daily email:** must enforce **provider + delivery date** isolation; durable dispatch record; global enable/timing must be enforced server-side if read from `notification_settings`.

---

## 8. Email system

**Paths:** `private.email_delivery_queue`, notification processors (`src/lib/process-*-notifications.ts`), direct SMTP (`sendTransactionalEmail`), failure alerts (`admin.email_delivery_failure`, `hr.email_delivery_failure`).

**Review:**

- Recipient eligibility (staff profile active, preferences, global disable).
- Mass fan-out abuse (unbounded recipient lists from user input).
- Queue **claim / retry / idempotency** (`idempotency_key`, correlation ids).
- **Failure-alert recursion** (alert about alert loops — `email_queue_failure_alert_loop_excluded`).
- Template **HTML injection:** user-controlled fields in `notification_email_templates` substitution; unescaped interpolation in HTML bodies.
- **SMTP errors** surfaced raw to end users vs sanitized summaries.

---

## 9. Server actions / input validation

**Flag:**

- Trusting FormData/JSON IDs without server-side ownership/capability checks.
- Unsafe UUID/date/email parsing; unchecked `as` casts on Supabase responses.
- **SQL injection** in dynamic SQL migrations/RPCs.
- **Open redirects** (`redirect(userSuppliedUrl)`).
- New **server-side fetch** to internal URLs with user-controlled hosts (SSRF).
- Missing validation on provider email, dispatch dates, notification settings.

**Convention:** mutations start with `requireMutate*` or governance `requireManage*`; reads use appropriate `require*Read` / `requireProfile`.

---

## 10. Workers / background jobs

**Entry:** `src/worker/run.ts` tasks (snapshots, automatic-dispatch, mail-queue, notifications, auth cleanup, user import).

**Flag:**

- Worker RPCs callable by normal JWT without `assert_worker_service_caller()`.
- Service client used from request-scoped code without equivalent authorization.
- **Duplicate execution** (missing idempotency, no claim lease).
- **Infinite retries** corrupting state or spamming providers/users.
- One bad row blocking entire batch without isolation.
- Worker mutating business state that should require HR/Accounts actor audit.

Workers **must not** rely on UI authorization; they rely on **service role + worker RPC guards**.

---

## 11. Auditability

**Expect audit trails for:**

- Support Mode start/end (`private.support_sessions`).
- Notification settings changes (`notification_settings_audit`).
- HR operational mutations (delivery reconciliation, late orders, provider dispatch reviews).
- Accounts period finalize and subsidy changes.
- Employee ID changes, bulk user import, role changes, auth settings.
- Provider dispatch **acknowledgement** (`provider_late_order_dispatch_reviews`).

**Flag MEDIUM+:** sensitive mutations with no actor/timestamp when peers in the same domain are audited.

---

## 12. Reporting priority and finding format

### Severity

| Level | Examples |
|-------|----------|
| **CRITICAL** | Exploitable privilege escalation; auth bypass; secret exposure; unrestricted bulk PII access; cross-user destructive mutation |
| **HIGH** | RLS/RPC auth gap; sensitive leakage; provider order leakage; HR/Accounts bypass; unsafe privileged duplicate mutations |
| **MEDIUM** | Race conditions with real abuse window; weak validation with operational impact; missing audit on sensitive paths |
| **LOW** | Defense-in-depth; limited exploitability; inconsistent but RPC/RLS still blocks |

Do **not** report: formatting, naming, component structure, or “missing tests” unless a test gap hides an exploitable bug.

### Required fields per finding

1. **Location** — file and function/RPC name (line if known).
2. **Scenario** — concrete steps or call path to exploit or fail.
3. **Preconditions** — role, Support Mode, timing, etc.
4. **Impact** — who/what is affected.
5. **Remediation** — minimal fix aligned with existing patterns (`requireMutate*`, `can_manage_*`, worker guard, RLS).

Sort findings **CRITICAL → LOW**.

---

## 13. False positives (do not report as vulnerabilities)

- **Admin/Owner** accessing **governance** routes (users, system settings, email templates) by design.
- **HR** viewing operational lunch data when guarded by `can_view_hr_operational_data()` / `requireViewAllOrders`.
- **Accounts** managing periods/financials when guarded by Accounts mutate helpers.
- **`createServiceClient()` / `SUPABASE_SECRET_KEY`** only in server/worker/hook code, not shipped to browser.
- **SECURITY DEFINER** with **`set search_path = ''`**, explicit **`can_*` / role checks**, and tight **`GRANT EXECUTE`**.
- **Employee names in provider supplemental emails** — approved operational content.
- **Dormant catalog entries** (e.g. `provider.daily_order_summary` without sender) — product gap, not an open exploit, unless a partial implementation exposes send without authorization.

Focus on violations of the **intended** authorization and business model above.

---

## 14. Review checklist (quick pass)

For each PR hunk, ask:

1. Who can call this entrypoint (browser, worker, hook)?
2. Does every mutation triple-check UI + server + SQL?
3. Are IDs in the payload scoped to the caller?
4. New tables: RLS + policies + revoked grants?
5. New RPCs: definer search_path, authz, grants?
6. Email/dispatch: wrong recipient or cross-tenant data?
7. Secrets or PII new exposure surface?
8. State machine: cutoff, finalize, dispatch status — can it be skipped?

---

*This file is configuration for Bugbot reviews only; it does not change application behavior.*
