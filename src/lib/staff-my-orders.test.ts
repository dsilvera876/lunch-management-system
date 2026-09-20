import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deriveCheckoutStatus,
  groupOrdersIntoCheckouts,
  isFullyCancelledGroup,
  mapRawOrderToProviderOrder,
  normalizePastOrderDateParam,
  selectCancelledCheckouts,
  selectPastCheckoutsForDate,
  selectUpcomingCheckouts,
} from "./staff-my-orders";

function buildRawOrder(overrides: {
  id: string;
  groupId: string;
  providerId: string;
  providerName: string;
  deliveryDate: string;
  orderDate: string;
  status?: string;
  deliveryState?: string;
  createdAt?: string;
  instructions?: string;
  gross?: number;
}) {
  const gross = overrides.gross ?? 850;
  return {
    id: overrides.id,
    order_group_id: overrides.groupId,
    status: overrides.status ?? "submitted",
    created_at: overrides.createdAt ?? "2026-09-18T19:14:00Z",
    updated_at: overrides.createdAt ?? "2026-09-18T19:14:00Z",
    delivery_state: overrides.deliveryState ?? "pending",
    financial_disposition: "chargeable",
    special_instructions: overrides.instructions ?? null,
    meal_quantity: 1,
    office_location_name: "Camp Road",
    lunch_days: {
      lunch_date: overrides.deliveryDate,
      order_date: overrides.orderDate,
      order_deadline: "2026-09-18T23:00:00Z",
      lunch_providers: { id: overrides.providerId, name: overrides.providerName },
    },
    order_items: [
      {
        quantity: 1,
        unit_price: gross,
        menu_items: {
          name: "Fried Chicken",
          item_type: "main",
          unit_label: "Each",
        },
      },
      {
        quantity: 1,
        unit_price: 0,
        menu_items: {
          name: "Rice & Peas",
          item_type: "side",
          unit_label: "Each",
        },
      },
    ],
  };
}

describe("staff my orders grouping", () => {
  it("groups multiple provider orders with the same order_group_id into one checkout", () => {
    const rows = [
      buildRawOrder({
        id: "o1",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        createdAt: "2026-09-18T19:14:00Z",
      }),
      buildRawOrder({
        id: "o2",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        createdAt: "2026-09-18T19:14:01Z",
        instructions: "No gravy",
      }),
      buildRawOrder({
        id: "o3",
        groupId: "g1",
        providerId: "p2",
        providerName: "Peel Good Food",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        createdAt: "2026-09-18T19:14:02Z",
        gross: 400,
      }),
    ];

    const groups = groupOrdersIntoCheckouts(rows, 500, new Map());
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.orderCount, 3);
    assert.equal(groups[0]!.providerCount, 2);
    assert.equal(groups[0]!.providerOrders[1]!.indexInGroup, 2);
    assert.equal(groups[0]!.providerOrders[1]!.specialInstructions, "No gravy");
  });

  it("keeps separate order_group_id values as separate checkouts", () => {
    const rows = [
      buildRawOrder({
        id: "o1",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
      }),
      buildRawOrder({
        id: "o2",
        groupId: "g2",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-08",
        orderDate: "2026-09-05",
      }),
    ];

    const groups = groupOrdersIntoCheckouts(rows, 500, new Map());
    assert.equal(groups.length, 2);
  });

  it("calculates checkout subsidy once per group", () => {
    const rows = [
      buildRawOrder({
        id: "o1",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        gross: 850,
      }),
      buildRawOrder({
        id: "o2",
        groupId: "g1",
        providerId: "p2",
        providerName: "Peel Good Food",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        gross: 400,
      }),
    ];

    const group = groupOrdersIntoCheckouts(rows, 500, new Map())[0]!;
    assert.equal(group.subtotal, 1250);
    assert.equal(group.lunchSubsidy, 500);
    assert.equal(group.youPay, 750);
  });

  it("selects only the three most recent cancelled groups", () => {
    const rows = [
      buildRawOrder({
        id: "c1",
        groupId: "g-cancel-1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-21",
        orderDate: "2026-09-18",
        status: "cancelled",
        createdAt: "2026-09-18T10:00:00Z",
      }),
      buildRawOrder({
        id: "c2",
        groupId: "g-cancel-2",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-20",
        orderDate: "2026-09-17",
        status: "cancelled",
        createdAt: "2026-09-17T10:00:00Z",
      }),
      buildRawOrder({
        id: "c3",
        groupId: "g-cancel-3",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-19",
        orderDate: "2026-09-16",
        status: "cancelled",
        createdAt: "2026-09-16T10:00:00Z",
      }),
      buildRawOrder({
        id: "c4",
        groupId: "g-cancel-4",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-18",
        orderDate: "2026-09-15",
        status: "cancelled",
        createdAt: "2026-09-15T10:00:00Z",
      }),
    ];

    const groups = groupOrdersIntoCheckouts(rows, 500, new Map());
    const cancelled = selectCancelledCheckouts(groups, 3);
    assert.equal(cancelled.length, 3);
    assert.ok(cancelled.every((group) => isFullyCancelledGroup(group.providerOrders)));
  });

  it("returns all past checkouts for the selected delivery date, newest first", () => {
    const rows = [
      buildRawOrder({
        id: "p1",
        groupId: "g-past-a",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-12",
        orderDate: "2026-09-11",
        deliveryState: "delivered",
        status: "fulfilled",
        createdAt: "2026-09-11T14:00:00Z",
      }),
      buildRawOrder({
        id: "p2",
        groupId: "g-past-b",
        providerId: "p2",
        providerName: "Peel Good Food",
        deliveryDate: "2026-09-12",
        orderDate: "2026-09-11",
        deliveryState: "delivered",
        status: "fulfilled",
        createdAt: "2026-09-11T10:00:00Z",
      }),
      buildRawOrder({
        id: "p3",
        groupId: "g-other-day",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2026-09-08",
        orderDate: "2026-09-05",
        deliveryState: "delivered",
        status: "fulfilled",
      }),
    ];

    const groups = groupOrdersIntoCheckouts(rows, 500, new Map());
    const matches = selectPastCheckoutsForDate(groups, "2026-09-12");
    assert.equal(matches.length, 2);
    assert.equal(matches[0]!.orderGroupId, "g-past-a");
    assert.equal(matches[1]!.orderGroupId, "g-past-b");
    assert.equal(selectPastCheckoutsForDate(groups, "2026-09-01").length, 0);
  });

  it("normalizes past order date query params safely", () => {
    assert.equal(normalizePastOrderDateParam("2026-09-12"), "2026-09-12");
    assert.equal(normalizePastOrderDateParam("2026-13-01"), null);
    assert.equal(normalizePastOrderDateParam("not-a-date"), null);
    assert.equal(normalizePastOrderDateParam(undefined), null);
  });

  it("wires past date picker to URL-selected date in YYYY-MM-DD form", () => {
    const pageSource = readFileSync(
      new URL("../app/my-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const clientSource = readFileSync(
      new URL("../components/my-orders/my-orders-page-client.tsx", import.meta.url),
      "utf8",
    );
    const pickerSource = readFileSync(
      new URL("../components/my-orders/past-order-date-picker.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /normalizePastOrderDateParam/);
    assert.match(pageSource, /selectedPastDate/);
    assert.match(clientSource, /selectedPastDate/);
    assert.doesNotMatch(clientSource, /resolveDefaultPastDate/);
    assert.match(clientSource, /selectPastCheckoutsForDate/);
    assert.match(pickerSource, /selectedDate/);
    assert.match(pickerSource, /value=\{inputValue\}/);
    assert.match(pickerSource, /Choose a date/);
    assert.match(pickerSource, /type="button"/);
    assert.match(pickerSource, /aria-label="Select past order date"/);
    assert.match(pickerSource, /type="date"/);
    assert.match(pickerSource, /pointer-events-none/);
    assert.match(pickerSource, /PastOrderCalendarPopover/);
    assert.match(pickerSource, /openNativePicker/);
    assert.match(pickerSource, /showPicker/);
    assert.match(pickerSource, /handleTriggerClick/);
    assert.match(pickerSource, /aria-expanded/);
    assert.match(pickerSource, /PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY/);
    assert.doesNotMatch(pickerSource, /absolute inset-0 z-10/);
    assert.match(clientSource, /Select a date to view your past lunch order/);
    assert.match(clientSource, /No lunch order found for this date/);
    assert.match(clientSource, /MyOrdersToolbar/);
    assert.doesNotMatch(
      clientSource,
      /<p className="[^"]*text-muted[^"]*">\s*Showing your 3 most recent cancelled orders\./,
    );
    assert.match(clientSource, /description="Showing your 3 most recent cancelled orders\."/);
    const toolbarSource = readFileSync(
      new URL("../components/my-orders/my-orders-toolbar.tsx", import.meta.url),
      "utf8",
    );
    assert.match(toolbarSource, /items-center/);
    assert.match(toolbarSource, /justify-between/);
    assert.match(toolbarSource, /MyOrdersTabs/);
    assert.match(toolbarSource, /pastDatePicker/);
  });

  it("derives upcoming status for future delivery", () => {
    const order = mapRawOrderToProviderOrder(
      buildRawOrder({
        id: "o1",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
      }),
      1,
      1,
    );

    const status = deriveCheckoutStatus([order], "2099-09-21", "2099-09-18");
    assert.equal(status.label, "Upcoming");
  });

  it("does not include legacy order_group_id null fallback in page loader", () => {
    const pageSource = readFileSync(
      new URL("../app/my-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const libSource = readFileSync(
      new URL("./staff-my-orders-load.ts", import.meta.url),
      "utf8",
    );
    const cancelledSource = readFileSync(
      new URL("../components/my-orders/grouped-checkout-card.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /loadStaffGroupedCheckouts/);
    assert.match(pageSource, /Place another order/);
    assert.match(libSource, /not\("order_group_id", "is", null\)/);
    assert.doesNotMatch(libSource, /legacy/i);
    assert.doesNotMatch(cancelledSource, /bg-red|text-red|ring-red/);
    assert.match(cancelledSource, /cancellationSummary/);
  });

  it("routes Place another order to lunch ordering", () => {
    const pageSource = readFileSync(
      new URL("../app/my-orders/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(pageSource, /href="\/lunch"/);
  });

  it("sorts upcoming checkouts by nearest delivery first", () => {
    const rows = [
      buildRawOrder({
        id: "u2",
        groupId: "g2",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2099-09-25",
        orderDate: "2099-09-22",
      }),
      buildRawOrder({
        id: "u1",
        groupId: "g1",
        providerId: "p1",
        providerName: "Alberries Caterors",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
      }),
    ];

    const upcoming = selectUpcomingCheckouts(groupOrdersIntoCheckouts(rows, 500, new Map()));
    assert.equal(upcoming[0]!.deliveryDate, "2099-09-21");
  });
});
