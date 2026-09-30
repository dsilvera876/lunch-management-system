import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  businessCalendarEntryTypeLabel,
  businessCalendarScopeLabel,
} from "./business-calendar-presentation";

describe("business calendar presentation", () => {
  it("labels entry types for HR table rendering", () => {
    assert.equal(businessCalendarEntryTypeLabel("override_open"), "Override — Open");
    assert.equal(businessCalendarScopeLabel("global", null), "Company-wide");
    assert.equal(businessCalendarScopeLabel("location", "Kingston"), "Kingston");
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

    assert.match(page, /Business Calendar/);
    assert.match(page, /list_business_calendar_entries/);
    assert.match(workspace, /SupportModeMutationHint/);
    assert.match(workspace, /Add Calendar Entry/);
    assert.match(drawer, /previewBusinessCalendarEntryImpactAction/);
    assert.match(drawer, /Confirm and save/);
    assert.doesNotMatch(workspace, /\/admin\/lunch-days/);
  });
});
