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
  resolveStaffMyOrdersCheckoutGroupKey,
} from "./staff-my-orders";

function buildRawOrder(overrides: {
  id: string;
  groupId?: string | null;
  providerId: string;
  providerName: string;
  deliveryDate: string;
  orderDate: string;
  status?: string;
  deliveryState?: string;
  createdAt?: string;
  instructions?: string;
  gross?: number;
  isLateOrder?: boolean;
}) {
  const gross = overrides.gross ?? 850;
  return {
    id: overrides.id,
    order_group_id: overrides.groupId ?? null,
    is_late_order: overrides.isLateOrder ?? false,
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
      lunch_providers: {
        id: overrides.providerId,
        name: overrides.providerName,
        ratings_enabled: false,
      },
    },
    order_items: [
      {
        quantity: 1,
        unit_price: gross,
        menu_items: {
          name: "Fried Chicken",
          item_type: "main",
          unit_label: "Each",
          provider_menu_item_id: null,
        },
      },
      {
        quantity: 1,
        unit_price: 0,
        menu_items: {
          name: "Rice & Peas",
          item_type: "side",
          unit_label: "Each",
          provider_menu_item_id: null,
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
    assert.match(pickerSource, /aria-labelledby="past-order-date-label past-order-date-value"/);
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

  it("loads fulfilled HR late orders and groups null order_group_id by order id", () => {
    const libSource = readFileSync(
      new URL("./staff-my-orders-load.ts", import.meta.url),
      "utf8",
    );
    const providerSectionSource = readFileSync(
      new URL("../components/my-orders/provider-order-section.tsx", import.meta.url),
      "utf8",
    );

    assert.match(libSource, /is_late_order/);
    assert.match(libSource, /is_late_order\.eq\.true/);
    assert.match(libSource, /order_group_id\.not\.is\.null/);
    assert.match(providerSectionSource, /StatusBadge status="late_order"/);

    const lateOrder = buildRawOrder({
      id: "late-1",
      groupId: null,
      providerId: "p1",
      providerName: "Kitchen A",
      deliveryDate: "2099-09-22",
      orderDate: "2099-09-19",
      isLateOrder: true,
    });

    assert.equal(resolveStaffMyOrdersCheckoutGroupKey(lateOrder), "late-1");

    const upcoming = selectUpcomingCheckouts(groupOrdersIntoCheckouts([lateOrder], 500, new Map()));
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0]!.providerOrders[0]!.isLateOrder, true);
  });

  it("classifies fulfilled late orders into past after delivery date", () => {
    const pastLate = buildRawOrder({
      id: "late-past",
      groupId: "g-late",
      providerId: "p1",
      providerName: "Kitchen A",
      deliveryDate: "2020-01-02",
      orderDate: "2020-01-01",
      isLateOrder: true,
      status: "submitted",
    });

    const groups = groupOrdersIntoCheckouts([pastLate], 500, new Map());
    const upcoming = selectUpcomingCheckouts(groups);
    assert.equal(upcoming.length, 0);
    assert.ok(groups[0]!.checkoutStatusKind === "submitted" || groups[0]!.deliveryDate < "2099-01-01");
  });

  it("does not treat pending staff late-order requests as My Orders rows", () => {
    const libSource = readFileSync(
      new URL("./staff-my-orders-load.ts", import.meta.url),
      "utf8",
    );

    assert.match(libSource, /\.from\("orders"\)/);
    assert.doesNotMatch(libSource, /staff_late_order_requests/);
  });

  it("scopes My Orders loader to the signed-in profile", () => {
    const libSource = readFileSync(
      new URL("./staff-my-orders-load.ts", import.meta.url),
      "utf8",
    );

    assert.match(libSource, /\.eq\("profile_id", profileId\)/);
  });

  it("includes cancelled fulfilled late orders in the cancelled tab", () => {
    const cancelledLate = buildRawOrder({
      id: "late-cancelled",
      groupId: "g-late-cancel",
      providerId: "p1",
      providerName: "Kitchen A",
      deliveryDate: "2099-09-22",
      orderDate: "2099-09-19",
      isLateOrder: true,
      status: "cancelled",
    });

    const cancelled = selectCancelledCheckouts(
      groupOrdersIntoCheckouts([cancelledLate], 500, new Map()),
    );
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0]!.providerOrders[0]!.isLateOrder, true);
  });

  it("does not expose staff self-service edit/cancel for HR late orders on detail page", () => {
    const pageSource = readFileSync(
      new URL("../app/lunch/orders/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /is_late_order/);
    assert.match(pageSource, /selfServiceMutable/);
    assert.match(pageSource, /!order\.is_late_order/);
    assert.doesNotMatch(pageSource, /order_group_id/);
  });

  it("my orders cards do not expose group cancel or edit actions", () => {
    const cardSource = readFileSync(
      new URL("../components/my-orders/grouped-checkout-card.tsx", import.meta.url),
      "utf8",
    );
    const providerSectionSource = readFileSync(
      new URL("../components/my-orders/provider-order-section.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(cardSource, /cancelLunchOrder|Cancel order|Edit order/);
    assert.doesNotMatch(providerSectionSource, /cancelLunchOrder|Cancel order|Edit order/);
    assert.match(providerSectionSource, /View order/);
  });

  it("backfill migration only assigns groups to late orders missing one", () => {
    const migrationSource = readFileSync(
      new URL("../../supabase/migrations/20261006140000_hr_late_order_checkout_group.sql", import.meta.url),
      "utf8",
    );

    assert.match(migrationSource, /where is_late_order = true/);
    assert.match(migrationSource, /and order_group_id is null/);
    assert.match(migrationSource, /gen_random_uuid\(\)/);
    assert.doesNotMatch(
      migrationSource,
      /update public\.orders[\s\S]*set order_group_id[\s\S]*where order_group_id is null[\s\S]*;/,
    );
  });

  it("my orders page wiring remains unchanged aside from late-order inclusion", () => {
    const pageSource = readFileSync(
      new URL("../app/my-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const cancelledSource = readFileSync(
      new URL("../components/my-orders/grouped-checkout-card.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /loadStaffGroupedCheckouts/);
    assert.match(pageSource, /Place another order/);
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
