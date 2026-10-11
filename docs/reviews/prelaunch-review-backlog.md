# Prelaunch review backlog

Findings from prelaunch reviews that are not yet fixed. Add new findings under the matching category,
keep the summary table in sync, and change the status rather than deleting resolved entries.

Release-time manual accessibility checks live in [`../staff-accessibility-manual-checklist.md`](../staff-accessibility-manual-checklist.md);
record any failures found there as Accessibility findings below.

## Conventions

- **ID:** `PRL-NNN`, assigned in order and never reused.
- **Severity:**
  - **Critical:** data loss, security exposure or a blocked core workflow. Must be fixed before launch.
  - **High:** incorrect results or a workflow that fails without a usable workaround.
  - **Medium:** misleading or unclear behavior with a workaround, or an unhandled error path.
  - **Low:** polish, wording or rare edge cases.
- **Status:** Open, In progress, Resolved (cite the commit), or Won't fix (give the reason).
- **Source:** the review or commit where the finding was raised.

## Summary

| ID | Category | Severity | Affected workflow | Status |
|---|---|---|---|---|
| PRL-001 | UI/UX | Medium | HR business calendar: add, edit and archive previews | Open |
| PRL-002 | UI/UX | Medium | HR business calendar: archive entry | Open |
| PRL-003 | Workflow | Low | HR business calendar: edit, move and archive entries | Open |
| PRL-004 | Accessibility | High | Staff `/lunch`: menu, cart and checkout actions | In progress |
| PRL-005 | Accessibility | High | Staff `/lunch`: Place Order when the cart is not ready | In progress |
| PRL-006 | Accessibility | High | Staff `/lunch`: checkout success confirmation | In progress |
| PRL-007 | Accessibility | High | Staff `/lunch`: delivery location picker | In progress |
| PRL-008 | Accessibility | High | Staff `/lunch`: late-order request drawer | Open |
| PRL-009 | Accessibility | High | All routes: page titles and route-change announcements | Open |
| PRL-010 | Accessibility | Medium | `/login`: sign-in form | Open |
| PRL-011 | Accessibility | Medium | Staff forms and rating stars | Open |
| PRL-012 | Accessibility | Medium | Staff `/lunch` cart and app header control names | Open |
| PRL-013 | Workflow | Medium | Staff `/lunch`: late-order submit and Clear All | Open |
| PRL-014 | UI/UX | Medium | Staff `/lunch`: closed-day state | Open |
| PRL-015 | Accessibility | Medium | Staff `/lunch`: ratings load failure | Open |
| PRL-016 | UI/UX | Low | All Staff routes: loading, errors and zoom | Open |
| PRL-017 | Accessibility | Low | Staff `/lunch`, `/home` and mobile navigation | Open |
| PRL-018 | Workflow | Medium | Staff accessibility regression tests | Open |

## Security

_No open findings._

## Accessibility

Source for PRL-004 to PRL-018: Phase 2A Staff UI/UX and accessibility review (2026-10-11), covering
`/login`, `/home` and `/lunch`. Findings marked "code inspection" could not be exercised in a browser
because ordering was closed on the review date.

### PRL-004: Keyboard focus is lost after ordering actions

- **Severity:** High
- **Affected workflow:** Staff `/lunch`: Add, Finish This Order, quantity changes, Remove, Clear All, Place Order.
- **Description:** The focused control is disabled or removed after activation (for example the Add button
  re-renders as a disabled "Added" button, and Remove unmounts its row), so focus falls to the page body.
  Screen-reader users lose their place and hear no confirmation. Focus should stay on, or move deliberately
  to, a stable target, with the result announced once. Code inspection (WCAG 2.4.3, 4.1.3).
- **Status:** In progress
- **Source:** Phase 2A review.
- **Remediation (uncommitted, awaiting review):** "Added" and the quantity buttons at their limits use
  `aria-disabled` so they stay focusable. Finish This Order focuses the completed entry's heading. Remove
  focuses the next (or previous) Remove control, or the Lunch Cart heading when none remain. Clear All
  focuses the heading. One polite cart announcer reports removals and clearing. Verified in Chromium and
  Firefox against a simulated weekday; NVDA speech still needs a manual weekday check.

### PRL-005: Blocked Place Order gives no explanation

- **Severity:** High
- **Affected workflow:** Staff `/lunch`: Place Order when ordering is closed, no location is chosen, or
  orders are unfinished.
- **Description:** `FormSubmitButton` cancels a blocked activation before the form submits, so the
  workspace validation that shows the error summary or opens the location picker never runs. Activation is
  silent. Code inspection (WCAG 3.3.1, 4.1.3).
- **Status:** In progress
- **Source:** Phase 2A review.
- **Remediation (uncommitted, awaiting review):** Place Order stays focusable when blocked and explains
  why: the error summary receives focus (without a live role, to avoid double speech), or the location
  picker opens with the reason as its description. Server-side validation is unchanged. Needs a manual
  NVDA check.

### PRL-006: Order success confirmation exists only in a 7-second toast

- **Severity:** High
- **Affected workflow:** Staff `/lunch`: placing an order.
- **Description:** After checkout the cart is cleared and the only confirmation, including the
  "View My Orders" link, is a toast that dismisses after 7 seconds without pausing on focus or hover. Users
  may not be able to verify the order was placed. Code inspection; whether the toast is announced needs
  NVDA testing (WCAG 2.2.1, 4.1.3).
- **Status:** In progress
- **Source:** Phase 2A review.
- **Remediation (uncommitted, awaiting review):** The toast is replaced by a persistent success panel
  above the status bar. Its heading receives focus, and it links to My Orders. It clears when the next
  checkout starts. Needs a manual NVDA check.

### PRL-007: Delivery location select commits on arrow keys

- **Severity:** High
- **Affected workflow:** Staff `/lunch`: choosing a delivery location, including saving a default.
- **Description:** The select's change handler applies the location, closes the picker and may save it as
  the default. On Windows, browsers fire change on each arrow key in a collapsed select, so keyboard users
  commit the first option they arrow onto. Selection should require explicit confirmation. Code inspection
  (WCAG 3.2.2, 3.3.4).
- **Status:** In progress
- **Source:** Phase 2A review.
- **Remediation (uncommitted, awaiting review):** The select only changes a pending choice. "Use this
  location" (or "Use default") applies it and saves it as the default if that box is ticked. Escape
  discards it. Focus returns to the control that opened the picker. Also fixed: the picker auto-opened
  during hydration (React error #418) and could open off-screen. Needs a manual check with a real Windows
  collapsed select.

### PRL-008: Late-order drawer moves focus unexpectedly

- **Severity:** High
- **Affected workflow:** Staff `/lunch`: late-order request drawer.
- **Description:** An effect in `staff-late-order-request-panel.tsx` focuses the delivery-date select
  whenever the entry form appears, which likely skips the drawer heading on open and pulls focus away from
  the location select when availability reloads. Needs browser confirmation (WCAG 2.4.3, 3.2.2).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-009: Every route has the same page title

- **Severity:** High
- **Affected workflow:** All routes.
- **Description:** Only the root layout defines a title, so Next.js does not announce client-side route
  changes and browser tabs and history are indistinguishable. Each route needs its own title. Verified in
  the browser (WCAG 2.4.2).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-010: Sign-in contrast and error handling

- **Severity:** Medium
- **Affected workflow:** `/login`.
- **Description:** The links and Sign in button use `#0d9488` (3.74:1) and the subtitle is 4.40:1. After a
  failed sign-in the email is cleared, focus is not moved to the error, and the fields have no
  `aria-invalid` or `aria-describedby`. The button has no pending state and the page has no `main`
  landmark. Verified in the browser (WCAG 1.4.3, 3.3.1, 4.1.2).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-011: Form field borders and empty rating stars lack contrast

- **Severity:** Medium
- **Affected workflow:** Staff forms (login, location picker, late-order form) and rating stars.
- **Description:** Field borders use `#e2e8f0` (1.23:1 on white) and unfilled stars use `text-teal-700/25`
  (about 1.4:1), below the 3:1 non-text minimum (WCAG 1.4.11).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-012: Unclear or duplicate control names

- **Severity:** Medium
- **Affected workflow:** Staff `/lunch` cart and the app header on narrow screens.
- **Description:** Cart Remove buttons are all named "Remove", trash labels repeat across providers, the
  mobile account link is announced as initials ("DS"), and the location button is named "· Change"
  (WCAG 2.4.4, 2.4.6, 4.1.2).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-015: Ratings load failure produces one alert per menu item

- **Severity:** Medium
- **Affected workflow:** Staff `/lunch` when rating summaries fail to load.
- **Description:** Each menu item renders its own `role="alert"`, replayed on every provider-tab switch,
  in addition to the page-level notice. The `text-destructive` class they use is not defined. Keep a single
  alert (WCAG 4.1.3).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-017: Heading levels, mobile-menu Escape and rating verbosity

- **Severity:** Low
- **Affected workflow:** Staff `/lunch`, `/home` and mobile navigation.
- **Description:** `/lunch` jumps from h1 to h3 when closed; Escape does not close the mobile menu; the
  closed-ordering button on `/home` is not focusable and not linked to its explanation; rating arrow keys are
  announced twice and unrated read-only stars read "0 of 5 stars".
- **Status:** Open
- **Source:** Phase 2A review.

## UI/UX

### PRL-014: Closed-day ordering messaging is contradictory

- **Severity:** Medium
- **Affected workflow:** Staff `/lunch` when ordering is closed.
- **Description:** The intro still tells staff to order "before today's cutoff", closure is repeated three
  times without saying when ordering reopens, and staff without a default location see "Select location" as
  plain text with no control.
- **Status:** Open
- **Source:** Phase 2A review (verified in the browser).

### PRL-016: No loading or error screens; sticky header at high zoom

- **Severity:** Low
- **Affected workflow:** All Staff routes.
- **Description:** No route has `loading.tsx` or `error.tsx`, so slow loads give no feedback. At 400% zoom
  the sticky header takes 38% of the viewport (WCAG 1.4.10 risk).
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-001: Calendar impact previews show zero when the simulation fails

- **Severity:** Medium
- **Affected workflow:** HR business calendar, impact preview before adding, editing or archiving an entry.
- **Description:** `private.simulate_calendar_change_invalidated_count` turns any error raised by the
  simulated change into a count of 0. `preview_business_calendar_entry_impact` and
  `preview_business_calendar_archive_impact` can therefore report no affected late-order requests when
  the simulation actually failed. The preview should report the error clearly instead.
- **Status:** Open
- **Source:** business-calendar integrity review, commit `f58219d`.

### PRL-002: Archive confirmation does not recover when the impact changes before saving

- **Severity:** Medium
- **Affected workflow:** HR business calendar, archiving an entry.
- **Description:** `handleArchive` in `src/components/admin/business-calendar-workspace.tsx` previews the
  impact, asks for confirmation, then archives. If a late-order request is created in between, the server
  correctly rejects the archive with `CALENDAR_IMPACT_CONFIRMATION_REQUIRED`, but the UI does not handle
  the error. It should re-run the preview and ask HR to confirm the updated count.
- **Status:** Open
- **Source:** business-calendar integrity review, commit `f58219d`.

## Workflow

### PRL-003: Calendar lock conflicts surface raw database errors

- **Severity:** Low
- **Affected workflow:** HR business calendar, editing, moving or archiving entries while other calendar or
  late-order activity is in progress.
- **Description:** Moving an entry to another date takes its date locks in more than one step, so Postgres
  can occasionally abort one transaction with a deadlock (`40P01`). The transaction rolls back safely, but the
  calendar actions show the raw database message. Map deadlocks, and the "calendar entry changed while it
  was being updated" error, to a clear message asking HR to try again.
- **Status:** Open
- **Source:** business-calendar integrity review, commit `f58219d`.

### PRL-013: Late-order submit has no pending state; Clear All has no confirmation

- **Severity:** Medium
- **Affected workflow:** Staff `/lunch`: late-order request submission and the cart's Clear All.
- **Description:** The late-order submit button gives no busy feedback and can be pressed twice. Clear All
  removes every finished order immediately with no confirmation or undo.
- **Status:** Open
- **Source:** Phase 2A review.

### PRL-018: Gaps in Staff accessibility regression tests

- **Severity:** Medium
- **Affected workflow:** Staff accessibility test suite.
- **Description:** `menu-item-most-popular.spec.ts` still expects the old "Rate Recent Orders" heading, so
  the Most Popular badge on `/home` is untested; rating-preview and Past Orders tests are flaky under
  parallel load; the open-ordering suite only runs on weekdays; and `/login` is never scanned by axe.
- **Status:** Open
- **Source:** Phase 2A review.

## Entry template

```markdown
### PRL-NNN: Short title

- **Severity:** Critical | High | Medium | Low
- **Affected workflow:** Role and screen or process affected.
- **Description:** What happens, why it matters and the expected behavior.
- **Status:** Open
- **Source:** Review name or commit.
```
