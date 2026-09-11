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
    assert.match(source, /stableSplitLayout/);
  });

  it("uses stable split layout in ProviderOrderForm for HR late orders", () => {
    const formSource = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );

    assert.match(formSource, /stableSplitLayout/);
    assert.match(formSource, /useSplitLayout/);
    assert.match(formSource, /Select items to see line items/);
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
