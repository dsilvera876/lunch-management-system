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

## Security

_No open findings._

## Accessibility

_No open findings._

## UI/UX

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

## Entry template

```markdown
### PRL-NNN: Short title

- **Severity:** Critical | High | Medium | Low
- **Affected workflow:** Role and screen or process affected.
- **Description:** What happens, why it matters and the expected behavior.
- **Status:** Open
- **Source:** Review name or commit.
```
