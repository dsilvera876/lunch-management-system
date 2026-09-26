import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ORDER_CUTOFF_SUCCESS_TOAST } from "./hr-settings-presentation";

describe("HR settings presentation", () => {
  it("matches the redesigned section structure and copy", () => {
    const settingsPage = readFileSync(
      new URL("../app/admin/settings/page.tsx", import.meta.url),
      "utf8",
    );
    const cutoffCard = readFileSync(
      new URL("../components/admin/order-cutoff-settings-card.tsx", import.meta.url),
      "utf8",
    );
    const operationsCard = readFileSync(
      new URL("../components/admin/settings-operations-card.tsx", import.meta.url),
      "utf8",
    );

    assert.match(settingsPage, /Configure ordering and operational settings/);
    assert.match(settingsPage, /SettingsSectionLabel>Ordering/);
    assert.match(settingsPage, /SettingsSectionLabel>Operations/);
    assert.match(cutoffCard, /Order cutoff time \(Jamaica\)/);
    assert.match(cutoffCard, /System-wide deadline for staff lunch orders/);
    assert.match(cutoffCard, /Save cutoff/);
    assert.match(cutoffCard, /type="time"/);
    assert.match(cutoffCard, /updateOrderCutoff/);
    assert.match(settingsPage, /Manage locations/);
    assert.match(settingsPage, /Manage providers/);
    assert.match(operationsCard, /actionLabel/);
    assert.match(settingsPage, /Provider communications/);
    assert.match(settingsPage, /href="\/admin\/providers"/);
    assert.match(settingsPage, /href="\/admin\/locations"/);
  });

  it("uses toast for cutoff success and avoids page-level success banners", () => {
    const settingsPage = readFileSync(
      new URL("../app/admin/settings/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/hr-settings-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(settingsPage, /HrSettingsWorkspace/);
    assert.match(settingsPage, /cutoff-updated/);
    assert.doesNotMatch(settingsPage, /variant="success"/);
    assert.doesNotMatch(settingsPage, /Alert variant="success"/);
    assert.match(workspace, /ORDER_CUTOFF_SUCCESS_TOAST/);
    assert.match(workspace, /ToastProvider/);
    assert.equal(ORDER_CUTOFF_SUCCESS_TOAST, "Order cutoff updated.");
  });

  it("removes legacy lunch days and daily subsidy from Settings", () => {
    const settingsPage = readFileSync(
      new URL("../app/admin/settings/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(settingsPage, /Legacy lunch days/);
    assert.doesNotMatch(settingsPage, /\/admin\/lunch-days/);
    assert.doesNotMatch(settingsPage, /Daily Lunch Subsidy/);
    assert.doesNotMatch(settingsPage, /daily-lunch-subsidy/);
    assert.doesNotMatch(settingsPage, />\s*Open\s*</);
  });

  it("preserves cutoff draft query on validation failures", () => {
    const actions = readFileSync(
      new URL("../app/admin/actions.ts", import.meta.url),
      "utf8",
    );
    const settingsPage = readFileSync(
      new URL("../app/admin/settings/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(actions, /cutoffDraft/);
    assert.match(settingsPage, /cutoffDraft/);
  });
});

