import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDeliveriesFilters,
  assertDeliveriesPayloadSafe,
  buildDeliveryPrintDocument,
  buildDeliveriesUrl,
  buildDeliveryRowDisplay,
  buildInitialDeliveriesFilters,
  computeDeliveryProgress,
  filterDeliveriesOrders,
  formatMobileOrderLines,
  getDeliveryDisplayLinePairs,
  groupOrdersByOfficeLocation,
  isDeliveryReconciled,
  patchDeliveryOrder,
  patchFromDelivered,
  resolveInitialReconciliationFilter,
  sanitizeDeliveriesFiltersAfterDateChange,
} from "./deliveries";
import type { OperationalOrder } from "./operational-orders";

function makeOrder(
  overrides: Partial<OperationalOrder> & Pick<OperationalOrder, "id">,
): OperationalOrder {
  return {
    status: "submitted",
    deliveryState: "pending",
    financialDisposition: "chargeable",
    deliveryIssueType: null,
    deliveryResolutionType: null,
    hrDeliveryNotes: null,
    actualDeliveryDate: null,
    lunchDayId: "ld-1",
    createdAt: "2026-01-01T12:00:00Z",
    specialInstructions: null,
    mealQuantity: null,
    employeeName: "Employee",
    officeLocationName: "Office 1",
    officeLocationAddress: null,
    orderDate: "2099-01-05",
    deliveryDate: "2099-01-06",
    providerId: "p1",
    providerName: "Alberries Caterors",
    items: [],
    isLateOrder: false,
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
    ...overrides,
  };
}

describe("deliveries grouping and progress", () => {
  it("groups orders by office location with provider identity retained", () => {
    const orders = [
      makeOrder({
        id: "o1",
        employeeName: "Jane Smith",
        officeLocationName: "Office 1",
        providerName: "Alberries Caterors",
      }),
      makeOrder({
        id: "o2",
        employeeName: "John Brown",
        officeLocationName: "Office 2",
        providerName: "Island Grill",
      }),
      makeOrder({
        id: "o3",
        employeeName: "Mary Jones",
        officeLocationName: "Office 1",
        providerName: "Island Grill",
      }),
    ];

    const groups = groupOrdersByOfficeLocation(orders);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.name, "Office 1");
    assert.equal(groups[0]?.orders.length, 2);
    assert.equal(groups[0]?.orders[0]?.employeeName, "Jane Smith");
    assert.equal(groups[0]?.orders[1]?.providerName, "Island Grill");
  });

  it("computes progress excluding cancelled orders from total and reconciled counts", () => {
    const orders = [
      makeOrder({ id: "o1", deliveryState: "pending" }),
      makeOrder({ id: "o2", deliveryState: "delivered" }),
      makeOrder({
        id: "o3",
        deliveryState: "resolved",
        financialDisposition: "waived",
      }),
      makeOrder({ id: "o4", status: "cancelled" }),
      makeOrder({ id: "o5", deliveryState: "issue_open", financialDisposition: "on_hold" }),
    ];

    const progress = computeDeliveryProgress(orders);

    assert.equal(progress.total, 4);
    assert.equal(progress.reconciled, 2);
    assert.equal(isDeliveryReconciled(orders[3]), false);
    assert.equal(isDeliveryReconciled(orders[4]), false);
    assert.equal(isDeliveryReconciled(orders[1]), true);
    assert.equal(isDeliveryReconciled(orders[2]), true);
  });

  it("filters issue-state orders without losing provider identity", () => {
    const orders = [
      makeOrder({ id: "o1", deliveryState: "pending" }),
      makeOrder({
        id: "o2",
        deliveryState: "issue_open",
        providerName: "Alberries Caterors",
      }),
    ];

    const filtered = filterDeliveriesOrders(orders, "issues");

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.providerName, "Alberries Caterors");
  });

  it("groups 100 orders deterministically by office and employee name", () => {
    const orders = Array.from({ length: 100 }, (_, index) =>
      makeOrder({
        id: `o-${index}`,
        employeeName: `Employee ${String(100 - index).padStart(3, "0")}`,
        officeLocationName: index % 2 === 0 ? "Office 1" : "Office 2",
        providerName: index % 3 === 0 ? "Alberries Caterors" : "Island Grill",
      }),
    );

    const first = groupOrdersByOfficeLocation(orders);
    const second = groupOrdersByOfficeLocation(orders);

    assert.deepEqual(
      first.map((group) => group.orders.map((order) => order.id)),
      second.map((group) => group.orders.map((order) => order.id)),
    );
    assert.equal(first.reduce((sum, group) => sum + group.orders.length, 0), 100);
  });
});

describe("delivery row display", () => {
  it("uses inline summary for meal bundles", () => {
    const display = buildDeliveryRowDisplay(
      makeOrder({
        id: "meal",
        mealQuantity: 2,
        items: [
          {
            name: "Fried Chicken",
            quantity: 2,
            itemType: "main",
            unitLabel: "Each",
            displayCategory: null,
          },
          {
            name: "Rice & Peas",
            quantity: 2,
            itemType: "side",
            unitLabel: "Each",
            displayCategory: null,
          },
        ],
      }),
    );

    assert.equal(display.displayMode, "inline");
    assert.match(display.summaryText ?? "", /Fried Chicken \+ Rice & Peas/);
    assert.deepEqual(display.quantityLines, ["2"]);
  });

  it("pairs desktop order and quantity lines with matching row counts", () => {
    const order = makeOrder({
      id: "fruit",
      items: [
        {
          name: "Red Seedless Grapes",
          quantity: 4,
          itemType: "standalone",
          unitLabel: "Each",
          displayCategory: "Fruit",
        },
        {
          name: "Banana",
          quantity: 4,
          itemType: "standalone",
          unitLabel: "Each",
          displayCategory: "Fruit",
        },
        {
          name: "Cantaloupe",
          quantity: 1,
          itemType: "standalone",
          unitLabel: "Each",
          displayCategory: "Fruit",
        },
      ],
    });

    const pairs = getDeliveryDisplayLinePairs(order);

    assert.equal(pairs.orderLines.length, pairs.quantityLines.length);
    assert.deepEqual(pairs.orderLines, [
      "Red Seedless Grapes",
      "Banana",
      "Cantaloupe",
    ]);
    assert.deepEqual(pairs.quantityLines, ["4", "4", "1"]);
  });

  it("formats mobile lines with inline quantity markers", () => {
    const meal = formatMobileOrderLines(
      makeOrder({
        id: "meal",
        mealQuantity: 2,
        items: [
          {
            name: "Fried Chicken",
            quantity: 2,
            itemType: "main",
            unitLabel: "Each",
            displayCategory: null,
          },
          {
            name: "Rice & Peas",
            quantity: 2,
            itemType: "side",
            unitLabel: "Each",
            displayCategory: null,
          },
          {
            name: "Steamed Vegetables",
            quantity: 2,
            itemType: "side",
            unitLabel: "Each",
            displayCategory: null,
          },
        ],
      }),
    );

    assert.deepEqual(meal, [
      "Fried Chicken + Rice & Peas + Steamed Vegetables ×2",
    ]);

    const standalone = formatMobileOrderLines(
      makeOrder({
        id: "fruit",
        items: [
          {
            name: "Red Seedless Grapes",
            quantity: 4,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
          {
            name: "Banana",
            quantity: 4,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
          {
            name: "Cantaloupe",
            quantity: 1,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
        ],
      }),
    );

    assert.deepEqual(standalone, [
      "Red Seedless Grapes ×4",
      "Banana ×4",
      "Cantaloupe ×1",
    ]);
  });

  it("uses stacked lines for multi-item standalone orders", () => {
    const display = buildDeliveryRowDisplay(
      makeOrder({
        id: "fruit",
        items: [
          {
            name: "Grapes",
            quantity: 4,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
          {
            name: "Banana",
            quantity: 4,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
          {
            name: "Cantaloupe",
            quantity: 1,
            itemType: "standalone",
            unitLabel: "Each",
            displayCategory: "Fruit",
          },
        ],
      }),
    );

    assert.equal(display.displayMode, "stacked");
    assert.deepEqual(display.summaryLines, ["Grapes", "Banana", "Cantaloupe"]);
    assert.deepEqual(display.quantityLines, ["4", "4", "1"]);
  });
});

describe("delivery mutation state helpers", () => {
  it("patches a delivered order in local state", () => {
    const orders = [makeOrder({ id: "o1", deliveryState: "pending" })];
    const patch = patchFromDelivered(orders[0], "2099-01-12");
    const next = patchDeliveryOrder(orders, patch);

    assert.equal(next[0]?.deliveryState, "delivered");
    assert.equal(next[0]?.financialDisposition, "chargeable");
    assert.equal(next[0]?.actualDeliveryDate, "2099-01-12");
  });
});

describe("deliveries filter state", () => {
  const orders = [
    makeOrder({
      id: "o1",
      providerId: "p1",
      officeLocationName: "Office 1",
      deliveryState: "delivered",
    }),
    makeOrder({
      id: "o2",
      providerId: "p2",
      officeLocationName: "Office 2",
      deliveryState: "pending",
    }),
  ];

  it("defaults status to pending only when no explicit status param is supplied", () => {
    assert.equal(resolveInitialReconciliationFilter(undefined), "pending");
    assert.equal(resolveInitialReconciliationFilter(""), "pending");
    assert.equal(resolveInitialReconciliationFilter("delivered"), "delivered");
    assert.equal(
      buildInitialDeliveriesFilters({
        deliveryDate: "2099-01-06",
      }).reconciliationStatus,
      "pending",
    );
    assert.equal(
      buildInitialDeliveriesFilters({
        deliveryDate: "2099-01-06",
        statusParam: "issues",
      }).reconciliationStatus,
      "issues",
    );
  });

  it("preserves status when changing provider or office filters", () => {
    const base = {
      deliveryDate: "2099-01-06",
      providerId: "",
      officeLocation: "",
      reconciliationStatus: "delivered" as const,
    };

    const byProvider = applyDeliveriesFilters(orders, {
      ...base,
      providerId: "p1",
    });
    const byOffice = applyDeliveriesFilters(orders, {
      ...base,
      officeLocation: "Office 1",
    });

    assert.equal(byProvider.length, 1);
    assert.equal(byProvider[0]?.deliveryState, "delivered");
    assert.equal(byOffice.length, 1);
    assert.equal(byOffice[0]?.deliveryState, "delivered");
  });

  it("preserves status across date changes when provider and office remain valid", () => {
    const filters = {
      deliveryDate: "2099-01-07",
      providerId: "p1",
      officeLocation: "Office 1",
      reconciliationStatus: "delivered" as const,
    };

    const next = sanitizeDeliveriesFiltersAfterDateChange(filters, orders);

    assert.equal(next.reconciliationStatus, "delivered");
    assert.equal(next.providerId, "p1");
    assert.equal(next.officeLocation, "Office 1");
  });

  it("falls back only invalid provider or office filters after date change", () => {
    const filters = {
      deliveryDate: "2099-01-07",
      providerId: "missing",
      officeLocation: "Missing Office",
      reconciliationStatus: "issues" as const,
    };

    const next = sanitizeDeliveriesFiltersAfterDateChange(filters, orders);

    assert.equal(next.providerId, "");
    assert.equal(next.officeLocation, "");
    assert.equal(next.reconciliationStatus, "issues");
  });

  it("builds URLs that omit pending status but keep explicit status filters", () => {
    assert.equal(
      buildDeliveriesUrl({
        deliveryDate: "2099-01-06",
        providerId: "",
        officeLocation: "",
        reconciliationStatus: "pending",
      }),
      "/admin/deliveries?deliveryDate=2099-01-06",
    );
    assert.equal(
      buildDeliveriesUrl({
        deliveryDate: "2099-01-06",
        providerId: "p1",
        officeLocation: "Office 1",
        reconciliationStatus: "delivered",
      }),
      "/admin/deliveries?deliveryDate=2099-01-06&provider=p1&location=Office+1&status=delivered",
    );
  });
});

describe("delivery print payload", () => {
  it("groups print rows by office with compact multi-line quantities", () => {
    const document = buildDeliveryPrintDocument(
      [
        makeOrder({
          id: "o1",
          employeeName: "Mary Jones",
          officeLocationName: "Office 1",
          items: [
            {
              name: "Grapes",
              quantity: 4,
              itemType: "standalone",
              unitLabel: "Each",
              displayCategory: "Fruit",
            },
            {
              name: "Banana",
              quantity: 4,
              itemType: "standalone",
              unitLabel: "Each",
              displayCategory: "Fruit",
            },
          ],
        }),
      ],
      "2099-01-06",
      "Alberries Caterors",
    );

    assert.equal(document.providerName, "Alberries Caterors");
    assert.equal(document.offices.length, 1);
    assert.equal(document.offices[0]?.providers.length, 1);
    assert.deepEqual(document.offices[0]?.providers[0]?.rows[0]?.orderLines, [
      "Grapes",
      "Banana",
    ]);
    assert.deepEqual(document.offices[0]?.providers[0]?.rows[0]?.quantityLines, ["4", "4"]);
  });

  it("groups all-provider print rows by office then provider", () => {
    const document = buildDeliveryPrintDocument(
      [
        makeOrder({
          id: "o1",
          employeeName: "Jane Smith",
          officeLocationName: "Office 1",
          providerName: "Alberries Caterors",
        }),
        makeOrder({
          id: "o2",
          employeeName: "John Brown",
          officeLocationName: "Office 1",
          providerName: "Fresh Fruit Vendor",
        }),
      ],
      "2099-01-06",
      null,
    );

    assert.equal(document.providerName, null);
    assert.equal(document.offices.length, 1);
    assert.equal(document.offices[0]?.providers.length, 2);
    assert.equal(document.offices[0]?.providers[0]?.name, "Alberries Caterors");
    assert.equal(document.offices[0]?.providers[1]?.name, "Fresh Fruit Vendor");
    assert.equal(document.offices[0]?.providers[0]?.rows[0]?.employeeName, "Jane Smith");
    assert.equal(document.offices[0]?.providers[1]?.rows[0]?.employeeName, "John Brown");
  });

  it("prints special instructions without a Staff prefix and leaves notes blank otherwise", () => {
    const withNotes = buildDeliveryPrintDocument(
      [
        makeOrder({
          id: "o1",
          specialInstructions: "Lots of gravy on both",
        }),
        makeOrder({
          id: "o2",
          specialInstructions: null,
        }),
      ],
      "2099-01-06",
      "Alberries Caterors",
    );

    const notedRow = withNotes.offices[0]?.providers[0]?.rows[0];
    const blankRow = withNotes.offices[0]?.providers[0]?.rows[1];

    assert.equal(notedRow?.notesHint, "Lots of gravy on both");
    assert.equal(blankRow?.notesHint, null);
    assert.ok(!String(notedRow?.notesHint ?? "").startsWith("Staff:"));
  });

  it("rejects unsafe financial or private fields in delivery payloads", () => {
    assert.throws(
      () => assertDeliveriesPayloadSafe({ employeeName: "Jane", unit_price: 10 }),
      /unit_price/,
    );
    assert.throws(
      () => assertDeliveriesPayloadSafe({ hr_delivery_notes: "secret" }),
      /hr_delivery_notes/,
    );
    assert.doesNotThrow(() =>
      assertDeliveriesPayloadSafe({
        providerName: "Alberries Caterors",
        offices: [
          {
            name: "Office 1",
            providers: [{ name: "Alberries Caterors", rows: [{ employeeName: "Jane Smith" }] }],
          },
        ],
      }),
    );
  });
});
