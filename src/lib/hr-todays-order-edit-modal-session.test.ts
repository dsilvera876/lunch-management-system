import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HrStaffOrderEditContext } from "@/app/admin/todays-orders/actions";
import {
  deriveHrEditFormDefaults,
  EMPTY_HR_EDIT_MODAL_DRAFT,
  hrEditFormMountKey,
  hrEditModalDraftOnLoadStart,
  hrEditModalDraftOnSessionEnd,
  shouldApplyHrEditContextFetch,
} from "@/lib/hr-todays-order-edit-modal-session";

function sampleContext(
  overrides: Partial<HrStaffOrderEditContext> & Pick<HrStaffOrderEditContext, "updatedAt" | "items">,
): HrStaffOrderEditContext {
  return {
    orderId: "00000000-0000-0000-0000-000000000001",
    providerName: "Test Provider",
    orderDate: "2026-10-08",
    deliveryDate: "2026-10-09",
    mealQuantity: 1,
    menuItems: [],
    ...overrides,
  };
}

describe("hr todays order edit modal session", () => {
  it("clears draft on session end and on each load start", () => {
    const dirty = {
      context: sampleContext({
        updatedAt: "2026-10-08T12:00:00Z",
        items: [],
      }),
      reason: "Prior reason",
      formError: "Stale",
      loadError: "Load failed",
    };

    assert.deepEqual(hrEditModalDraftOnSessionEnd(), EMPTY_HR_EDIT_MODAL_DRAFT);
    assert.deepEqual(hrEditModalDraftOnLoadStart(), EMPTY_HR_EDIT_MODAL_DRAFT);
    assert.notDeepEqual(dirty, EMPTY_HR_EDIT_MODAL_DRAFT);
  });

  it("A: reopen after save uses new updatedAt and item selection defaults", () => {
    const itemA = {
      menu_item_id: "main-a",
      name: "Item A",
      item_type: "main",
      unit_label: "Each",
      display_category: null,
      quantity: 1,
      unit_price: 10,
    };
    const itemB = {
      menu_item_id: "main-b",
      name: "Item B",
      item_type: "main",
      unit_label: "Each",
      display_category: null,
      quantity: 1,
      unit_price: 11,
    };
    const side = {
      menu_item_id: "side-1",
      name: "Rice",
      item_type: "side",
      unit_label: "Each",
      display_category: null,
      quantity: 1,
      unit_price: 3,
    };

    let draft = hrEditModalDraftOnLoadStart();
    draft = {
      ...draft,
      context: sampleContext({
        updatedAt: "2026-10-08T10:00:00Z",
        items: [itemA, side],
      }),
    };

    const firstDefaults = deriveHrEditFormDefaults(
      draft.context!.items,
      draft.context!.mealQuantity,
    );
    assert.equal(firstDefaults.mainMenuItemId, "main-a");

    draft = hrEditModalDraftOnSessionEnd();
    draft = hrEditModalDraftOnLoadStart();
    draft = {
      ...draft,
      context: sampleContext({
        updatedAt: "2026-10-08T11:00:00Z",
        items: [itemB, side],
      }),
    };

    const secondDefaults = deriveHrEditFormDefaults(
      draft.context!.items,
      draft.context!.mealQuantity,
    );
    assert.equal(secondDefaults.mainMenuItemId, "main-b");
    assert.notEqual(
      hrEditFormMountKey(draft.context!.orderId, "2026-10-08T10:00:00Z"),
      hrEditFormMountKey(draft.context!.orderId, draft.context!.updatedAt),
    );
  });

  it("B: external change between sessions shows latest fetched context", () => {
    const externalMain = {
      menu_item_id: "main-external",
      name: "External",
      item_type: "main",
      unit_label: "Each",
      display_category: null,
      quantity: 1,
      unit_price: 12,
    };

    const draft = {
      ...hrEditModalDraftOnLoadStart(),
      context: sampleContext({
        updatedAt: "2026-10-08T12:30:00Z",
        items: [externalMain],
      }),
    };

    const defaults = deriveHrEditFormDefaults(
      draft.context!.items,
      draft.context!.mealQuantity,
    );
    assert.equal(defaults.mainMenuItemId, "main-external");
    assert.equal(draft.context!.updatedAt, "2026-10-08T12:30:00Z");
  });

  it("C: ignores stale in-flight fetch when modal closed or order switched", () => {
    assert.equal(
      shouldApplyHrEditContextFetch({
        requestedOrderId: "a",
        currentOrderId: "b",
        cancelled: false,
      }),
      false,
    );
    assert.equal(
      shouldApplyHrEditContextFetch({
        requestedOrderId: "a",
        currentOrderId: "a",
        cancelled: true,
      }),
      false,
    );
    assert.equal(
      shouldApplyHrEditContextFetch({
        requestedOrderId: "a",
        currentOrderId: "a",
        cancelled: false,
      }),
      true,
    );
  });

  it("D: close without save clears abandoned draft before reopen", () => {
    const abandoned = {
      ...hrEditModalDraftOnLoadStart(),
      context: sampleContext({
        updatedAt: "2026-10-08T09:00:00Z",
        items: [
          {
            menu_item_id: "main-draft",
            name: "Draft main",
            item_type: "main",
            unit_label: "Each",
            display_category: null,
            quantity: 1,
            unit_price: 9,
          },
        ],
      }),
      reason: "Abandoned HR reason",
    };

    const cleared = { ...abandoned, ...hrEditModalDraftOnSessionEnd() };
    assert.equal(cleared.context, null);
    assert.equal(cleared.reason, "");

    const reopenedContext = sampleContext({
      updatedAt: "2026-10-08T09:05:00Z",
      items: [
        {
          menu_item_id: "main-server",
          name: "Server main",
          item_type: "main",
          unit_label: "Each",
          display_category: null,
          quantity: 1,
          unit_price: 9,
        },
      ],
    });

    assert.equal(
      deriveHrEditFormDefaults(reopenedContext.items, reopenedContext.mealQuantity)
        .mainMenuItemId,
      "main-server",
    );
  });
});
