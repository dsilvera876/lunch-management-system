import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PROVIDER_SUCCESS_TOAST,
  providerEditFlashToastTitle,
} from "./provider-form";

describe("provider form presentation", () => {
  it("maps edit flash query params to toast titles", () => {
    assert.equal(providerEditFlashToastTitle("updated"), PROVIDER_SUCCESS_TOAST.updated);
    assert.equal(
      providerEditFlashToastTitle("statusUpdated"),
      PROVIDER_SUCCESS_TOAST.statusUpdated,
    );
    assert.equal(providerEditFlashToastTitle("lateUpdated"), PROVIDER_SUCCESS_TOAST.lateUpdated);
  });

  it("wires edit and add provider forms to shared details fields", () => {
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );
    const addDrawer = readFileSync(
      new URL("../components/admin/lunch-providers/add-provider-drawer.tsx", import.meta.url),
      "utf8",
    );
    const fields = readFileSync(
      new URL("../components/admin/lunch-providers/provider-details-fields.tsx", import.meta.url),
      "utf8",
    );

    assert.match(editPage, /ProviderDetailsFields/);
    assert.match(addDrawer, /ProviderDetailsFields/);
    assert.match(fields, /Provider name/);
    assert.match(fields, /Provider icon/);
    assert.match(fields, /ProviderIconPicker/);
    assert.match(fields, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,3fr\)\]/);
    assert.match(addDrawer, /descriptionRows=\{2\}/);
  });

  it("removes redundant edit provider back links and uses toast success feedback", () => {
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(editPage, /All providers/);
    assert.doesNotMatch(editPage, /Manage menu/);
    assert.doesNotMatch(editPage, /Lunch Providers/);
    assert.doesNotMatch(editPage, /variant="success"/);
    assert.match(editPage, /ProviderEditWorkspace/);
    assert.match(editPage, /ProviderIconWell iconKey=\{provider\.icon_key\} size="large"/);
  });

  it("shows large header icon and danger-zone deletion treatments", () => {
    const dangerZone = readFileSync(
      new URL("../components/admin/lunch-providers/provider-danger-zone.tsx", import.meta.url),
      "utf8",
    );
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(dangerZone, /canDeletePermanently/);
    assert.match(dangerZone, /Permanent deletion unavailable/);
    assert.match(dangerZone, /Delete permanently/);
    assert.match(editPage, /isProviderEligibleForPermanentDeletion/);
  });

  it("keeps late-order dependent fields behind the enabled toggle", () => {
    const lateSettings = readFileSync(
      new URL("../components/admin/provider-late-order-settings.tsx", import.meta.url),
      "utf8",
    );

    assert.match(lateSettings, /acceptsLateOrders/);
    assert.match(lateSettings, /lateOrdersEnabled/);
    assert.match(lateSettings, /supplementalDispatchMode/);
  });
});
