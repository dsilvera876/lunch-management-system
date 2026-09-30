import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BUSINESS_CALENDAR_IMPACT_BODY,
  businessCalendarEntryTypeLabel,
  businessCalendarScopeLabel,
  businessCalendarTableActionClassName,
  formatBusinessCalendarImpactHeadline,
  hasBusinessCalendarImpactWarning,
} from "./business-calendar-presentation";

describe("business calendar presentation", () => {
  it("labels entry types for HR table rendering", () => {
    assert.equal(businessCalendarEntryTypeLabel("override_open"), "Override — Open");
    assert.equal(businessCalendarScopeLabel("global", null), "Company-wide");
    assert.equal(businessCalendarScopeLabel("location", "Kingston"), "Kingston");
  });

  it("formats impact warning headlines with schedules and orders", () => {
    assert.equal(
      formatBusinessCalendarImpactHeadline(2, 2),
      "2 lunch schedules and 2 submitted orders will be affected.",
    );
    assert.equal(
      formatBusinessCalendarImpactHeadline(1, 1),
      "1 lunch schedule and 1 submitted order will be affected.",
    );
  });

  it("formats impact warning headlines for schedules only or orders only", () => {
    assert.equal(
      formatBusinessCalendarImpactHeadline(2, 0),
      "2 lunch schedules will be affected.",
    );
    assert.equal(
      formatBusinessCalendarImpactHeadline(1, 0),
      "1 lunch schedule will be affected.",
    );
    assert.equal(
      formatBusinessCalendarImpactHeadline(0, 3),
      "3 submitted orders will be affected.",
    );
    assert.equal(
      formatBusinessCalendarImpactHeadline(0, 1),
      "1 submitted order will be affected.",
    );
  });

  it("omits impact warning copy when both counts are zero", () => {
    assert.equal(formatBusinessCalendarImpactHeadline(0, 0), null);
    assert.equal(hasBusinessCalendarImpactWarning(0, 0), false);
    assert.equal(hasBusinessCalendarImpactWarning(1, 0), true);
    assert.equal(hasBusinessCalendarImpactWarning(0, 2), true);
  });

  it("uses concise impact body without duplicate DB summary in UI", () => {
    const ui = readFileSync(
      new URL("../components/admin/business-calendar-ui.tsx", import.meta.url),
      "utf8",
    );

    assert.match(ui, /BUSINESS_CALENDAR_IMPACT_BODY/);
    assert.doesNotMatch(ui, /summary/);
    assert.doesNotMatch(ui, /will not be moved or cancelled/);
    assert.doesNotMatch(ui, /provider lunch schedule/);
  });

  it("exposes compact bordered table action treatments", () => {
    assert.match(businessCalendarTableActionClassName("view"), /rounded-md border/);
    assert.match(businessCalendarTableActionClassName("edit"), /rounded-md border/);
    assert.match(businessCalendarTableActionClassName("archive"), /border-red-200/);
  });

  it("exposes HR business calendar route and support-mode hints", () => {
    const page = readFileSync(
      new URL("../app/admin/settings/business-calendar/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/business-calendar-workspace.tsx", import.meta.url),
      "utf8",
    );
    const drawer = readFileSync(
      new URL("../components/admin/business-calendar-entry-drawer.tsx", import.meta.url),
      "utf8",
    );
    const ui = readFileSync(
      new URL("../components/admin/business-calendar-ui.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /Business Calendar/);
    assert.match(page, /list_business_calendar_entries/);
    assert.match(workspace, /SupportModeMutationHint/);
    assert.match(workspace, /Add Calendar Entry/);
    assert.match(workspace, /BusinessCalendarInfoCallout/);
    assert.match(workspace, /businessCalendarTableActionClassName\("view"\)/);
    assert.match(workspace, /businessCalendarTableActionClassName\("edit"\)/);
    assert.match(workspace, /businessCalendarTableActionClassName\("archive"\)/);
    assert.match(workspace, /Edit calendar entry/);
    assert.match(workspace, /Archive calendar entry/);
    assert.match(ui, /IconInfo/);
    assert.match(ui, /BUSINESS_CALENDAR_INFO_CALLOUT_ID/);
    assert.match(ui, /border-sky-200 bg-sky-50/);
    assert.match(ui, /BUSINESS_CALENDAR_IMPACT_WARNING_ID/);
    assert.match(ui, /IconAlertTriangle/);
    assert.match(ui, /border-amber-300 bg-amber-50/);
    assert.match(ui, /role="alert"/);
    assert.match(drawer, /previewBusinessCalendarEntryImpactAction/);
    assert.match(drawer, /BUSINESS_CALENDAR_DRAWER_ACTIONS\.confirmSave/);
    assert.match(drawer, /BUSINESS_CALENDAR_DRAWER_ACTIONS\.goBack/);
    assert.match(drawer, /scrollIntoView/);
    assert.match(drawer, /setImpact\(null\)/);
    assert.match(drawer, /persistEntry\(true\)/);
    assert.doesNotMatch(workspace, /\/admin\/lunch-days/);
  });

  it("keeps official rows view-only and support read-only mutations hidden", () => {
    const workspace = readFileSync(
      new URL("../components/admin/business-calendar-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /entry\.source === "official"/);
    assert.match(workspace, /isOfficial \|\| readOnly/);
    assert.match(workspace, /!readOnly \?/);
  });

  it("uses confirmation footer labels instead of save while impact is pending", () => {
    const drawer = readFileSync(
      new URL("../components/admin/business-calendar-entry-drawer.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /confirmationRequired \?/);
    assert.match(drawer, /BUSINESS_CALENDAR_DRAWER_ACTIONS\.goBack/);
    assert.match(drawer, /BUSINESS_CALENDAR_DRAWER_ACTIONS\.confirmSave/);
    assert.match(drawer, /FormActionStatus variant="error"/);
  });

  it("defines the shared impact body copy", () => {
    assert.equal(
      BUSINESS_CALENDAR_IMPACT_BODY,
      "New ordering will close for this date. Existing orders will remain unchanged.",
    );
  });
});
