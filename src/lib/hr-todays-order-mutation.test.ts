import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canHrMutateTodaysOrder,
  providerPrimaryDispatchLocksHrOrderMutation,
  deriveSnapshotPayloadFromAuditItems,
  mapHrOrderMutationError,
  normalizeHrOrderMutationReason,
} from "./hr-todays-order-mutation";

describe("hr todays order mutation helpers", () => {
  it("requires HR role and eligible order state", () => {
    const base = {
      isLateOrder: false,
      status: "submitted" as const,
      deliveryState: "pending" as const,
    };

    assert.equal(
      canHrMutateTodaysOrder({
        order: base,
        canMutateHr: true,
        primaryDispatchLocksOrders: false,
      }),
      true,
    );

    assert.equal(
      canHrMutateTodaysOrder({
        order: base,
        canMutateHr: false,
        primaryDispatchLocksOrders: false,
      }),
      false,
    );

    assert.equal(
      canHrMutateTodaysOrder({
        order: { ...base, isLateOrder: true },
        canMutateHr: true,
        primaryDispatchLocksOrders: false,
      }),
      false,
    );

    assert.equal(
      canHrMutateTodaysOrder({
        order: base,
        canMutateHr: true,
        primaryDispatchLocksOrders: true,
      }),
      false,
    );
  });

  it("locks HR mutations when primary dispatch is pending or sent", () => {
    assert.equal(
      providerPrimaryDispatchLocksHrOrderMutation({
        hasSuccessfulPrimarySend: false,
        latestStatus: "pending",
      }),
      true,
    );
    assert.equal(
      providerPrimaryDispatchLocksHrOrderMutation({
        hasSuccessfulPrimarySend: true,
        latestStatus: "sent",
      }),
      true,
    );
    assert.equal(
      providerPrimaryDispatchLocksHrOrderMutation({
        hasSuccessfulPrimarySend: false,
        latestStatus: "none",
      }),
      false,
    );
  });

  it("validates HR mutation reasons", () => {
    assert.equal(normalizeHrOrderMutationReason("  "), null);
    assert.equal(normalizeHrOrderMutationReason("Wrong side item"), "Wrong side item");
  });

  it("maps stale and dispatch business errors", () => {
    assert.match(
      mapHrOrderMutationError("Order changed; refresh and try again"),
      /updated elsewhere/i,
    );
    assert.match(
      mapHrOrderMutationError("Provider primary order dispatch already sent"),
      /provider order email/i,
    );
  });

  it("derives snapshot payload from audit items", () => {
    const payload = deriveSnapshotPayloadFromAuditItems(
      [
        {
          menu_item_id: "m1",
          name: "Chicken",
          item_type: "main",
          unit_label: "Each",
          display_category: null,
          quantity: 1,
          unit_price: 10,
        },
        {
          menu_item_id: "s1",
          name: "Rice",
          item_type: "side",
          unit_label: "Each",
          display_category: null,
          quantity: 1,
          unit_price: 3,
        },
      ],
      2,
    );

    assert.equal(payload.main_menu_item_id, "m1");
    assert.deepEqual(payload.side_menu_item_ids, ["s1"]);
    assert.equal(payload.meal_quantity, 2);
  });

  it("wires Today''s Orders UI to FocusTrapPopover modals", () => {
    const editModal = readFileSync(
      "src/components/admin/todays-orders/hr-todays-order-edit-modal.tsx",
      "utf8",
    );
    const cancelModal = readFileSync(
      "src/components/admin/todays-orders/hr-todays-order-cancel-modal.tsx",
      "utf8",
    );

    assert.match(editModal, /FocusTrapPopover/);
    assert.match(editModal, /triggerRef/);
    assert.match(editModal, /hrEditModalDraftOnLoadStart/);
    assert.match(editModal, /hrEditFormMountKey/);
    assert.match(cancelModal, /FocusTrapPopover/);
    assert.match(cancelModal, /triggerRef/);
    assert.match(cancelModal, /hrCancelModalDraftOnSessionEnd/);
    assert.match(editModal, /onClientSubmit/);
  });

  it("keeps optimistic concurrency on HR modify and cancel", () => {
    const sql = readFileSync(
      "supabase/migrations/20261008190000_hr_staff_order_mutation.sql",
      "utf8",
    );

    assert.match(sql, /from public\.orders\s+where id = p_order_id\s+for update/);
    assert.match(sql, /v_order\.updated_at is distinct from p_expected_updated_at/);
    assert.match(sql, /Order changed; refresh and try again/);
  });
});
