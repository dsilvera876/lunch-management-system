import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateOrderComposition } from "./menu-items";

describe("HR late-order UI", () => {
  it("does not expose raw JSON item entry in the workspace", () => {
    const source = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(source, /Items JSON/i);
    assert.doesNotMatch(source, /menu_item_id payload/i);
    assert.match(source, /ProviderOrderForm/);
    assert.doesNotMatch(source, /type="date"/);
    assert.match(source, /allowDefaultLocationUpdate=\{false\}/);
    assert.match(source, /providerCreationCycles/);
    assert.match(source, /deliveryPickByProvider/);
    assert.match(source, /layoutVariant="late-order"/);
    assert.match(source, /loadHrLateOrderSnapshotMenuAction/);
    assert.match(source, /ReadOnlyFormValue/);
    assert.match(source, /FormActionStatus/);
    assert.match(source, /ToastProvider/);
    assert.match(source, /showToast/);
    assert.match(source, /LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE/);
    assert.doesNotMatch(source, /onFeedback/);
    assert.doesNotMatch(source, /scrollTo/);
    assert.match(source, /menuLoading=\{loadingMenu\}/);
    assert.match(source, /submitDisabled=\{submitDisabled\}/);
    assert.doesNotMatch(source, /Loading frozen menu snapshot/);
    assert.match(source, /setMenuItems\(\[\]\)/);
    assert.match(source, /showWorkflowForm/);
    assert.match(source, /menuSelectionEpoch/);
    assert.doesNotMatch(source, /key=\{formKey\}/);
    assert.doesNotMatch(source, /setFormKey/);
    assert.match(source, /Order cycle date:/);
    assert.match(source, /EmployeePicker/);
    assert.match(source, /useState\(""\)/);
    assert.doesNotMatch(source, /employees\[0\]/);
    assert.match(source, /setProfileId\(""\)/);
    assert.match(source, /resolveLateOrderMenuPresentation/);
    assert.doesNotMatch(source, /This snapshot has no active menu items/);
  });

  it("uses stable split layout in ProviderOrderForm for HR late orders", () => {
    const formSource = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );

    assert.match(formSource, /LateOrderMenuLoadingSkeleton/);
    assert.match(formSource, /disabled=\{menuLoading \|\| submitDisabled\}/);
    assert.match(formSource, /loading=\{menuLoading\}/);
    assert.match(formSource, /menuSelectionEpoch/);
    assert.match(formSource, /includeOrderDateField/);
    assert.match(formSource, /stableSplitLayout/);

    const skeletonSource = readFileSync(
      new URL("../components/admin/late-orders/late-order-menu-loading-skeleton.tsx", import.meta.url),
      "utf8",
    );
    assert.match(skeletonSource, /aria-busy="true"/);
    assert.match(formSource, /useSplitLayout/);
    assert.match(formSource, /Select items below to see line items/);
    assert.match(formSource, /layoutVariant/);
  });

  it("validates meal composition for HR late orders", () => {
    assert.equal(
      validateOrderComposition({
        mainSelected: true,
        sideCount: 1,
        mealQuantity: 2,
        standaloneQuantities: [],
      }).valid,
      true,
    );

    assert.equal(
      validateOrderComposition({
        mainSelected: true,
        sideCount: 0,
        mealQuantity: 1,
        standaloneQuantities: [],
      }).valid,
      false,
    );

    assert.equal(
      validateOrderComposition({
        mainSelected: false,
        sideCount: 0,
        mealQuantity: 0,
        standaloneQuantities: [2],
      }).valid,
      true,
    );
  });
});
