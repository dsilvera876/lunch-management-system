import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseMyOrdersTab } from "@/lib/staff-my-orders";
import {
  findBlockingLateOrderSubmission,
  MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB,
  shouldMountStaffLateOrderSubmissionDrawer,
  sortLateOrderSubmissions,
} from "@/lib/staff-late-order-submissions";
import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";

const baseRequest: StaffLateOrderRequestRow = {
  id: "req-1",
  provider_id: "p1",
  provider_name: "Provider A",
  order_date: "2099-01-06",
  scheduled_delivery_date: "2099-01-07",
  status: "pending",
  requested_summary: "Chicken",
  quantity: 1,
  special_instructions: null,
  decline_reason: null,
  fulfilled_order_id: null,
  office_location_id: "loc-1",
  office_location_name: "Camp Road",
  created_at: "2099-01-06T12:00:00Z",
  updated_at: "2099-01-06T12:00:00Z",
};

describe("late order submissions tab routing", () => {
  it("parses deep-link tab and falls back safely", () => {
    assert.equal(parseMyOrdersTab(MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB), MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB);
    assert.equal(parseMyOrdersTab("not-a-tab"), "upcoming");
  });

  it("routes status CTAs to My Orders submissions tab", () => {
    const dashboard = readFileSync(
      new URL("../components/dashboard/staff-dashboard.tsx", import.meta.url),
      "utf8",
    );
    const headerAction = readFileSync(
      new URL("../components/lunch/staff-late-order-header-action.tsx", import.meta.url),
      "utf8",
    );
    assert.match(dashboard, /\/my-orders\?tab=late-order-submissions/);
    assert.match(headerAction, /MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF/);
  });
});

describe("late order submission sorting and blocking", () => {
  it("sorts by delivery date desc then created_at desc", () => {
    const sorted = sortLateOrderSubmissions([
      { ...baseRequest, id: "a", scheduled_delivery_date: "2099-01-07", created_at: "2099-01-05T10:00:00Z" },
      { ...baseRequest, id: "b", scheduled_delivery_date: "2099-01-08", created_at: "2099-01-04T10:00:00Z" },
      { ...baseRequest, id: "c", scheduled_delivery_date: "2099-01-07", created_at: "2099-01-06T10:00:00Z" },
    ]);
    assert.deepEqual(sorted.map((row) => row.id), ["b", "c", "a"]);
  });

  it("blocks duplicate submission for pending or fulfilled requests", () => {
    assert.ok(findBlockingLateOrderSubmission([baseRequest], "p1", "2099-01-07"));
    assert.equal(
      findBlockingLateOrderSubmission(
        [{ ...baseRequest, status: "declined" }],
        "p1",
        "2099-01-07",
      ),
      null,
    );
  });
});

describe("submission drawer mount guard", () => {
  it("mounts only when actionable cycles or authoritative opportunity exist", () => {
    assert.equal(shouldMountStaffLateOrderSubmissionDrawer(0, false), false);
    assert.equal(shouldMountStaffLateOrderSubmissionDrawer(1, false), true);
    assert.equal(shouldMountStaffLateOrderSubmissionDrawer(0, true), true);
  });
});

describe("drawer submission-only UX", () => {
  it("does not render request history cards in the drawer panel", () => {
    const panel = readFileSync(
      new URL("../components/lunch/staff-late-order-request-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(panel, /requestRows\.map/);
    assert.doesNotMatch(panel, /Edit pending request/);
    assert.match(panel, /View late order submissions/);
  });

  it("renders submission cards in My Orders tab", () => {
    const pageClient = readFileSync(
      new URL("../components/my-orders/my-orders-page-client.tsx", import.meta.url),
      "utf8",
    );
    assert.match(pageClient, /LateOrderSubmissionCard/);
    assert.match(pageClient, /No late order submissions yet/);
  });
});

describe("late order submission edit modal focus return", () => {
  it("wires each card Edit button ref into FocusTrapPopover", () => {
    const card = readFileSync(
      new URL("../components/my-orders/late-order-submission-card.tsx", import.meta.url),
      "utf8",
    );
    const modal = readFileSync(
      new URL("../components/my-orders/late-order-submission-edit-modal.tsx", import.meta.url),
      "utf8",
    );

    assert.match(card, /editTriggerRef/);
    assert.match(card, /ref=\{editTriggerRef\}/);
    assert.match(card, /triggerRef=\{editTriggerRef\}/);
    assert.match(modal, /triggerRef: RefObject<HTMLButtonElement/);
    assert.match(modal, /triggerRef=\{triggerRef\}/);
    assert.doesNotMatch(
      modal,
      /const triggerRef = useRef<HTMLButtonElement>\(null\)/,
    );
  });

  it("restores focus on explicit dismiss paths and after save", () => {
    const modal = readFileSync(
      new URL("../components/my-orders/late-order-submission-edit-modal.tsx", import.meta.url),
      "utf8",
    );

    assert.match(modal, /closeAndRestoreFocus/);
    assert.match(modal, /triggerRef\.current\?\.focus\(\)/);
    assert.match(modal, /onClick=\{closeAndRestoreFocus\}/);
    assert.match(modal, /closeAndRestoreFocus\(\)/);
    assert.match(modal, /initialFocusRef=\{headingRef\}/);
    assert.doesNotMatch(modal, /role="dialog"/);
  });
});
