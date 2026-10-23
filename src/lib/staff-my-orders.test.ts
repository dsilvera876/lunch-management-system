import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deriveStaffOrderCapabilities,
  deriveCheckoutStatus,
  getOrderFinancialStatusLabel,
  groupOrdersIntoCheckouts,
  isFullyCancelledGroup,
  isFinanciallyChargeableOrder,
  mapRawOrderToProviderOrder,
  normalizePastOrderDateParam,
  selectCancelledCheckouts,
  selectPastCheckoutsForDate,
  selectUpcomingCheckouts,
  resolveStaffMyOrdersCheckoutGroupKey,
  resolveDailySubsidyByOrderDate,
  parseStaffMyOrdersSnapshot,
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
  financialDisposition?: "chargeable" | "on_hold" | "waived";
  providerActive?: boolean;
  lunchDayStatus?: string;
}) {
  const gross = overrides.gross ?? 850;
  return {
    id: overrides.id,
    lunch_day_id: `lunch-day-${overrides.providerId}`,
    order_group_id: overrides.groupId ?? null,
    is_late_order: overrides.isLateOrder ?? false,
    status: overrides.status ?? "submitted",
    created_at: overrides.createdAt ?? "2026-09-18T19:14:00Z",
    updated_at: overrides.createdAt ?? "2026-09-18T19:14:00Z",
    delivery_state: overrides.deliveryState ?? "pending",
    financial_disposition: overrides.financialDisposition ?? "chargeable",
    special_instructions: overrides.instructions ?? null,
    meal_quantity: 1,
    office_location_id: "20000001-0001-4001-8001-000000000001",
    office_location_name: "Camp Road",
    lunch_days: {
      status: overrides.lunchDayStatus ?? "open",
      lunch_date: overrides.deliveryDate,
      order_date: overrides.orderDate,
      order_deadline: "2026-09-18T23:00:00Z",
      lunch_providers: {
        id: overrides.providerId,
        name: overrides.providerName,
        ratings_enabled: false,
        active: overrides.providerActive ?? true,
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
    assert.equal(group.originalSubtotal, 1250);
    assert.equal(group.chargeableSubtotal, 1250);
    assert.equal(group.lunchSubsidy, 500);
    assert.equal(group.youPay, 750);
  });

  it("excludes cancelled and non-chargeable orders from employee amounts while retaining original values", () => {
    const rows = [
      buildRawOrder({
        id: "active",
        groupId: "mixed-financial",
        providerId: "p1",
        providerName: "Active Provider",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        gross: 850,
      }),
      buildRawOrder({
        id: "cancelled",
        groupId: "mixed-financial",
        providerId: "p2",
        providerName: "Cancelled Provider",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        status: "cancelled",
        gross: 400,
      }),
      buildRawOrder({
        id: "waived",
        groupId: "mixed-financial",
        providerId: "p3",
        providerName: "Waived Provider",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        status: "fulfilled",
        financialDisposition: "waived",
        gross: 300,
      }),
      buildRawOrder({
        id: "on-hold",
        groupId: "mixed-financial",
        providerId: "p4",
        providerName: "On-hold Provider",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        financialDisposition: "on_hold",
        gross: 200,
      }),
    ];

    const group = groupOrdersIntoCheckouts(rows, 500, new Map())[0]!;
    assert.equal(group.originalSubtotal, 1750);
    assert.equal(group.chargeableSubtotal, 850);
    assert.equal(group.lunchSubsidy, 500);
    assert.equal(group.youPay, 350);
    assert.equal(group.payLabel, "You Pay");
    assert.deepEqual(
      group.providerOrders.map(isFinanciallyChargeableOrder),
      [true, false, false, false],
    );
    assert.equal(getOrderFinancialStatusLabel(group.providerOrders[1]!), "Cancelled — not charged");
    assert.equal(getOrderFinancialStatusLabel(group.providerOrders[2]!), "Waived — not charged");
    assert.equal(
      getOrderFinancialStatusLabel(group.providerOrders[3]!),
      "On hold — not currently charged",
    );
  });

  it("shows fully cancelled checkouts as no amount due without consuming subsidy", () => {
    const group = groupOrdersIntoCheckouts(
      [
        buildRawOrder({
          id: "cancelled-only",
          groupId: "cancelled-financial",
          providerId: "p1",
          providerName: "Cancelled Provider",
          deliveryDate: "2099-09-21",
          orderDate: "2099-09-18",
          status: "cancelled",
          gross: 850,
        }),
      ],
      500,
      new Map(),
    )[0]!;

    assert.equal(group.originalSubtotal, 850);
    assert.equal(group.chargeableSubtotal, 0);
    assert.equal(group.lunchSubsidy, 0);
    assert.equal(group.youPay, 0);
    assert.equal(group.payLabel, "No amount due");
  });

  it("uses Your cost rather than implying a delivered order was paid", () => {
    const group = groupOrdersIntoCheckouts(
      [
        buildRawOrder({
          id: "delivered",
          groupId: "delivered-financial",
          providerId: "p1",
          providerName: "Delivered Provider",
          deliveryDate: "2020-09-21",
          orderDate: "2020-09-18",
          status: "fulfilled",
          deliveryState: "delivered",
          gross: 850,
        }),
      ],
      500,
      new Map(),
    )[0]!;

    assert.equal(group.payLabel, "Your cost");
    assert.equal(group.youPay, 350);
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
    const snapshotMigration = readFileSync(
      new URL(
        "../../supabase/migrations/20261023120000_staff_my_orders_snapshot.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const providerSectionSource = readFileSync(
      new URL("../components/my-orders/provider-order-section.tsx", import.meta.url),
      "utf8",
    );

    assert.match(snapshotMigration, /o\.order_group_id is not null/);
    assert.match(snapshotMigration, /o\.is_late_order = true/);
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

    assert.match(libSource, /\.rpc\("get_my_orders_snapshot"\)/);
    assert.doesNotMatch(libSource, /staff_late_order_requests/);
  });

  it("loads one authenticated snapshot without accepting a profile identifier or paginating", () => {
    const libSource = readFileSync(
      new URL("./staff-my-orders-load.ts", import.meta.url),
      "utf8",
    );

    assert.match(libSource, /supabase\.rpc\("get_my_orders_snapshot"\)/);
    assert.doesNotMatch(libSource, /profileId|\.range\(|\.from\("orders"\)/);
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

  it("shows per-order edit and cancel actions only for mutable self-service orders", () => {
    const cardSource = readFileSync(
      new URL("../components/my-orders/grouped-checkout-card.tsx", import.meta.url),
      "utf8",
    );
    const providerSectionSource = readFileSync(
      new URL("../components/my-orders/provider-order-section.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(cardSource, /cancelLunchOrder|Cancel order|Edit order/);
    assert.match(providerSectionSource, /order\.canEdit/);
    assert.match(providerSectionSource, /order\.canCancel/);
    assert.match(providerSectionSource, /cancelLunchOrder/);
    assert.match(providerSectionSource, /Cancel order/);
    assert.match(providerSectionSource, /Edit order/);
    assert.match(providerSectionSource, /aria-labelledby=\{providerHeadingId\}/);
    assert.match(providerSectionSource, /from \{order\.providerName\}/);
    assert.match(providerSectionSource, /bg-amber-800 text-white/);
    assert.doesNotMatch(providerSectionSource, /View order/);

    const rows = [
      buildRawOrder({
        id: "editable",
        groupId: "actions",
        providerId: "p1",
        providerName: "Provider One",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
      }),
      buildRawOrder({
        id: "locked",
        groupId: "actions",
        providerId: "p2",
        providerName: "Provider Two",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
      }),
      buildRawOrder({
        id: "late",
        groupId: "actions",
        providerId: "p3",
        providerName: "Provider Three",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        isLateOrder: true,
      }),
      buildRawOrder({
        id: "cancelled",
        groupId: "actions",
        providerId: "p4",
        providerName: "Provider Four",
        deliveryDate: "2099-09-21",
        orderDate: "2099-09-18",
        status: "cancelled",
      }),
    ];
    const checkout = groupOrdersIntoCheckouts(
      rows,
      500,
      new Map(),
      new Map([
        ["editable", { canEdit: true, canCancel: true }],
        ["late", { canEdit: true, canCancel: true }],
        ["cancelled", { canEdit: true, canCancel: true }],
      ]),
    )[0]!;

    assert.deepEqual(
      checkout.providerOrders.map((order) => [order.canEdit, order.canCancel]),
      [
        [true, true],
        [false, false],
        [false, false],
        [false, false],
      ],
    );
  });

  it("derives Edit and Cancel independently from authoritative ordering evidence", () => {
    const order = buildRawOrder({
      id: "capabilities",
      groupId: "capabilities-group",
      providerId: "p1",
      providerName: "Provider One",
      deliveryDate: "2099-09-21",
      orderDate: "2099-09-18",
    });
    const valid = {
      order,
      effectiveDeadline: "2099-09-18T23:59:00Z",
      orderingState: {
        isOpen: true,
        isBusinessDay: true,
        periodFinalized: false,
      },
      today: "2099-09-18",
      nowMs: new Date("2099-09-18T12:00:00Z").getTime(),
    };

    assert.deepEqual(deriveStaffOrderCapabilities(valid), {
      canEdit: true,
      canCancel: true,
    });
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        orderingState: { ...valid.orderingState, isOpen: false, isBusinessDay: false },
      }),
      { canEdit: false, canCancel: true },
      "a calendar closure blocks editing but the cancel RPC still permits cancellation",
    );
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        orderingState: { ...valid.orderingState, periodFinalized: true },
      }),
      { canEdit: false, canCancel: false },
    );
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        effectiveDeadline: "2099-09-18T11:59:00Z",
      }),
      { canEdit: false, canCancel: false },
    );
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        orderingState: null,
      }),
      { canEdit: false, canCancel: false },
      "ordering-state lookup failures fail closed",
    );
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        order: buildRawOrder({
          id: "closed-lunch-day",
          groupId: "capabilities-group",
          providerId: "p1",
          providerName: "Provider One",
          lunchDayStatus: "closed",
          deliveryDate: "2099-09-21",
          orderDate: "2099-09-18",
        }),
      }),
      { canEdit: false, canCancel: false },
    );
    assert.deepEqual(
      deriveStaffOrderCapabilities({
        ...valid,
        order: buildRawOrder({
          id: "inactive-provider",
          groupId: "capabilities-group",
          providerId: "p1",
          providerName: "Provider One",
          providerActive: false,
          deliveryDate: "2099-09-21",
          orderDate: "2099-09-18",
        }),
      }),
      { canEdit: false, canCancel: false },
    );
  });

  it("renders the provider-card layout with decorative dotted leaders and a consolidated summary", () => {
    const cardSource = readFileSync(
      new URL("../components/my-orders/grouped-checkout-card.tsx", import.meta.url),
      "utf8",
    );
    const providerSectionSource = readFileSync(
      new URL("../components/my-orders/provider-order-section.tsx", import.meta.url),
      "utf8",
    );
    const summarySource = readFileSync(
      new URL("../components/my-orders/checkout-financial-summary.tsx", import.meta.url),
      "utf8",
    );

    assert.match(cardSource, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(17rem,20rem\)\]/);
    assert.match(providerSectionSource, /data-testid="provider-order-card"/);
    assert.match(providerSectionSource, /data-testid="order-price-leader"/);
    assert.match(providerSectionSource, /aria-hidden/);
    assert.match(providerSectionSource, /MenuItemRatingBlock/);
    assert.match(providerSectionSource, /OrderLineRatings/);
    assert.match(summarySource, /Provider order totals/);
    assert.match(summarySource, /checkout\.originalSubtotal/);
    assert.match(summarySource, /checkout\.chargeableSubtotal/);
    assert.match(summarySource, /checkout\.lunchSubsidy/);
    assert.match(summarySource, /checkout\.youPay/);
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

  it("uses finalized subsidy snapshots while open periods use the current subsidy", () => {
    const subsidies = resolveDailySubsidyByOrderDate({
      orderDates: ["2026-08-12", "2026-10-21", "2026-12-01"],
      currentDailySubsidy: "500.00",
      lunchPeriods: [
        {
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          status: "finalized",
          finalized_daily_subsidy: "350.00",
        },
        {
          start_date: "2026-10-01",
          end_date: "2026-10-31",
          status: "open",
          finalized_daily_subsidy: null,
        },
      ],
    });

    assert.equal(subsidies.get("2026-08-12"), 350);
    assert.equal(subsidies.get("2026-10-21"), 500);
    assert.equal(subsidies.get("2026-12-01"), 500);
  });

  it("fails closed for missing finalized snapshots, malformed money, and overlapping periods", () => {
    assert.throws(
      () => resolveDailySubsidyByOrderDate({
        orderDates: ["2026-08-12"],
        currentDailySubsidy: 500,
        lunchPeriods: [{
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          status: "finalized",
          finalized_daily_subsidy: null,
        }],
      }),
      /Unable to load your order totals/,
    );
    assert.throws(
      () => resolveDailySubsidyByOrderDate({
        orderDates: ["2026-08-12"],
        currentDailySubsidy: "not-money",
        lunchPeriods: [],
      }),
      /Unable to load your order totals/,
    );
    assert.throws(
      () => resolveDailySubsidyByOrderDate({
        orderDates: ["2026-08-12"],
        currentDailySubsidy: 500,
        lunchPeriods: [
          {
            start_date: "2026-08-01",
            end_date: "2026-08-31",
            status: "open",
            finalized_daily_subsidy: null,
          },
          {
            start_date: "2026-08-10",
            end_date: "2026-08-20",
            status: "open",
            finalized_daily_subsidy: null,
          },
        ],
      }),
      /Unable to load your order totals/,
    );
  });

  it("allocates one daily subsidy chronologically across multiple chargeable checkouts", () => {
    const rows = [
      buildRawOrder({
        id: "later",
        groupId: "group-later",
        providerId: "p2",
        providerName: "Later Provider",
        deliveryDate: "2026-08-15",
        orderDate: "2026-08-12",
        createdAt: "2026-08-12T15:00:00Z",
        gross: 400,
      }),
      buildRawOrder({
        id: "earlier",
        groupId: "group-earlier",
        providerId: "p1",
        providerName: "Earlier Provider",
        deliveryDate: "2026-08-15",
        orderDate: "2026-08-12",
        createdAt: "2026-08-12T14:00:00Z",
        gross: 300,
      }),
    ];

    const groups = groupOrdersIntoCheckouts(
      rows,
      new Map([["2026-08-12", 500]]),
      new Map(),
    );
    const earlier = groups.find((group) => group.orderGroupId === "group-earlier")!;
    const later = groups.find((group) => group.orderGroupId === "group-later")!;

    assert.deepEqual(
      { subsidy: earlier.lunchSubsidy, cost: earlier.youPay },
      { subsidy: 300, cost: 0 },
    );
    assert.deepEqual(
      { subsidy: later.lunchSubsidy, cost: later.youPay },
      { subsidy: 200, cost: 200 },
    );
    assert.equal(
      groups.reduce((sum, group) => sum + group.lunchSubsidy, 0),
      500,
      "checkout subsidy allocations must equal the authoritative daily subsidy cap",
    );
    assert.equal(groups.reduce((sum, group) => sum + group.youPay, 0), 200);
  });

  it("does not let cancelled or non-chargeable earlier checkouts consume subsidy", () => {
    const rows = [
      buildRawOrder({
        id: "cancelled-first",
        groupId: "cancelled-first-group",
        providerId: "p1",
        providerName: "Cancelled Provider",
        deliveryDate: "2026-08-15",
        orderDate: "2026-08-12",
        createdAt: "2026-08-12T12:00:00Z",
        gross: 800,
        status: "cancelled",
      }),
      buildRawOrder({
        id: "waived-second",
        groupId: "waived-second-group",
        providerId: "p2",
        providerName: "Waived Provider",
        deliveryDate: "2026-08-15",
        orderDate: "2026-08-12",
        createdAt: "2026-08-12T13:00:00Z",
        gross: 700,
        financialDisposition: "waived",
      }),
      buildRawOrder({
        id: "chargeable-last",
        groupId: "chargeable-last-group",
        providerId: "p3",
        providerName: "Chargeable Provider",
        deliveryDate: "2026-08-15",
        orderDate: "2026-08-12",
        createdAt: "2026-08-12T14:00:00Z",
        gross: 600,
      }),
    ];

    const groups = groupOrdersIntoCheckouts(
      rows,
      new Map([["2026-08-12", 500]]),
      new Map(),
    );
    assert.equal(groups.find((group) => group.orderGroupId === "cancelled-first-group")!.lunchSubsidy, 0);
    assert.equal(groups.find((group) => group.orderGroupId === "waived-second-group")!.lunchSubsidy, 0);
    const chargeable = groups.find((group) => group.orderGroupId === "chargeable-last-group")!;
    assert.equal(chargeable.lunchSubsidy, 500);
    assert.equal(chargeable.youPay, 100);
  });

  it("parses a complete single-snapshot payload and rejects incomplete financial context", () => {
    const order = buildRawOrder({
      id: "snapshot-order",
      groupId: "snapshot-group",
      providerId: "snapshot-provider",
      providerName: "Snapshot Provider",
      deliveryDate: "2026-08-15",
      orderDate: "2026-08-12",
    });
    const snapshotOrder = {
      ...order,
      delivered_at: null,
      effective_order_deadline: "2026-08-12T23:00:00Z",
      ordering_state: {
        is_open: true,
        is_business_day: true,
        period_finalized: false,
      },
    };
    const payload = {
      snapshot_version: 1,
      snapshot_at: "2026-08-12T12:00:00Z",
      jamaica_today: "2026-08-12",
      financial_context_valid: true,
      daily_subsidies: [{
        order_date: "2026-08-12",
        effective_daily_subsidy: 500,
      }],
      orders: [snapshotOrder],
    };

    const parsed = parseStaffMyOrdersSnapshot(payload);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.dailySubsidyByOrderDate.get("2026-08-12"), 500);
    assert.throws(
      () => parseStaffMyOrdersSnapshot({ ...payload, financial_context_valid: false }),
      /Unable to load your order totals/,
    );
    assert.throws(
      () => parseStaffMyOrdersSnapshot({ ...payload, daily_subsidies: [] }),
      /Unable to load your order totals/,
    );
    assert.throws(
      () => parseStaffMyOrdersSnapshot({
        ...payload,
        orders: [snapshotOrder, snapshotOrder],
      }),
      /Unable to load your order totals/,
    );
  });

  it("fails closed when a checkout has missing or inconsistent financial dates", () => {
    assert.throws(
      () => groupOrdersIntoCheckouts([
        buildRawOrder({
          id: "missing-date",
          groupId: "bad-date-group",
          providerId: "p1",
          providerName: "Provider One",
          deliveryDate: "2026-08-15",
          orderDate: "",
        }),
      ], new Map(), new Map()),
      /Unable to load your order totals/,
    );

    assert.throws(
      () => groupOrdersIntoCheckouts([
        buildRawOrder({
          id: "first-date",
          groupId: "mixed-date-group",
          providerId: "p1",
          providerName: "Provider One",
          deliveryDate: "2026-08-15",
          orderDate: "2026-08-12",
        }),
        buildRawOrder({
          id: "second-date",
          groupId: "mixed-date-group",
          providerId: "p2",
          providerName: "Provider Two",
          deliveryDate: "2026-08-16",
          orderDate: "2026-08-13",
        }),
      ], new Map([
        ["2026-08-12", 500],
        ["2026-08-13", 500],
      ]), new Map()),
      /Unable to load your order totals/,
    );
  });
});
