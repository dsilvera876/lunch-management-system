import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDefaultOperationalDeliveryDate } from "./operational-delivery-date";
import { orderDateBelongsToPeriod } from "./lunch-periods";
import {
  assertProviderPrintPayloadSafe,
  buildOperationalDeliveryReport,
  buildOperationalOrderDetailGroups,
  canFulfillOperationalOrder,
  groupOperationalOrdersByProvider,
  toProviderPrintOrder,
  type OperationalOrder,
} from "./operational-orders";

function makeOrder(overrides: Partial<OperationalOrder> & Pick<OperationalOrder, "id">): OperationalOrder {
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
    ...overrides,
  };
}

describe("getDefaultOperationalDeliveryDate", () => {
  it("uses today on weekdays", () => {
    assert.equal(getDefaultOperationalDeliveryDate("2099-01-06"), "2099-01-06");
  });

  it("uses next Monday on weekends", () => {
    assert.equal(getDefaultOperationalDeliveryDate("2099-01-10"), "2099-01-12");
    assert.equal(getDefaultOperationalDeliveryDate("2099-01-11"), "2099-01-12");
  });
});

describe("operational order grouping", () => {
  const orders: OperationalOrder[] = [
    makeOrder({
      id: "o1",
      employeeName: "Jane Smith",
      officeLocationName: "Office 1",
      providerId: "p1",
      providerName: "Alberries Caterors",
      mealQuantity: 2,
      items: [
        { name: "Fried Chicken", quantity: 2, itemType: "main", unitLabel: "Each", displayCategory: null },
        { name: "Rice & Peas", quantity: 2, itemType: "side", unitLabel: "Each", displayCategory: null },
        { name: "Coconut Water", quantity: 2, itemType: "standalone", unitLabel: "Each", displayCategory: "Juices" },
      ],
      specialInstructions: "Lots of gravy",
    }),
    makeOrder({
      id: "o2",
      employeeName: "Jane Smith",
      officeLocationName: "Office 1",
      providerId: "p1",
      providerName: "Alberries Caterors",
      items: [
        { name: "BBQ Chicken", quantity: 1, itemType: "main", unitLabel: "Each", displayCategory: null },
        { name: "Vegetables", quantity: 1, itemType: "side", unitLabel: "Each", displayCategory: null },
      ],
    }),
    makeOrder({
      id: "o3",
      employeeName: "David King",
      officeLocationName: "Office 2",
      providerId: "p2",
      providerName: "Fresh Fruit Vendor",
      items: [
        { name: "Grapes", quantity: 4, itemType: "standalone", unitLabel: "1/4 LB", displayCategory: "Fruit" },
        { name: "Banana", quantity: 4, itemType: "standalone", unitLabel: "Each", displayCategory: "Fruit" },
      ],
    }),
    makeOrder({
      id: "o4",
      employeeName: "Cancelled User",
      officeLocationName: "Office 1",
      providerId: "p1",
      providerName: "Alberries Caterors",
      status: "cancelled",
      deliveryState: "resolved",
      financialDisposition: "waived",
      items: [
        { name: "Fried Chicken", quantity: 99, itemType: "main", unitLabel: "Each", displayCategory: null },
      ],
    }),
  ];

  it("groups by provider then office without mixing", () => {
    const providers = groupOperationalOrdersByProvider(orders);
    assert.equal(providers.length, 2);
    assert.equal(providers[0]?.providerName, "Alberries Caterors");
    assert.equal(providers[1]?.providerName, "Fresh Fruit Vendor");
    assert.equal(providers[0]?.offices.length, 1);
    assert.equal(providers[0]?.offices[0]?.name, "Office 1");
    assert.equal(providers[0]?.offices[0]?.orders.length, 3);
    assert.equal(providers[1]?.offices[0]?.name, "Office 2");
  });

  it("keeps multiple orders from the same employee separate", () => {
    const providers = groupOperationalOrdersByProvider(orders);
    const officeOrders = providers[0]?.offices[0]?.orders ?? [];
    const janeOrders = officeOrders.filter((order) => order.employeeName === "Jane Smith");
    assert.equal(janeOrders.length, 2);
    assert.notEqual(janeOrders[0]?.id, janeOrders[1]?.id);
  });

  it("excludes cancelled orders from preparation totals", () => {
    const providers = groupOperationalOrdersByProvider(orders);
    const alberries = providers.find((provider) => provider.providerName === "Alberries Caterors");
    const mains = alberries?.preparationSections.find((section) => section.label === "Mains");
    const friedChicken = mains?.lines.find((line) => line.name === "Fried Chicken");
    assert.equal(friedChicken?.quantity, 2);
  });

  it("aggregates meal and standalone quantities from stored line quantities", () => {
    const providers = groupOperationalOrdersByProvider(orders);
    const alberries = providers.find((provider) => provider.providerName === "Alberries Caterors");
    const juices = alberries?.preparationSections.find((section) => section.label === "Juices");
    assert.equal(juices?.lines[0]?.quantity, 2);

    const fruitVendor = providers.find((provider) => provider.providerName === "Fresh Fruit Vendor");
    const fruit = fruitVendor?.preparationSections.find((section) => section.label === "Fruit");
    assert.equal(fruit?.lines.find((line) => line.name === "Grapes")?.quantity, 4);
    assert.equal(fruit?.lines.find((line) => line.name === "Banana")?.quantity, 4);
  });

  it("builds office summaries for delivery batches", () => {
    const providers = groupOperationalOrdersByProvider(orders);
    const alberries = providers.find((provider) => provider.providerName === "Alberries Caterors");
    assert.deepEqual(alberries?.officeSummaries, [{ name: "Office 1", orderCount: 2 }]);
  });

  it("preserves special instructions and snapshot categories in detail groups", () => {
    const order = orders[0];
    assert.ok(order);
    const groups = buildOperationalOrderDetailGroups(order);
    assert.equal(groups.mealQuantity, 2);
    assert.equal(groups.mains[0]?.name, "Fried Chicken");
    assert.ok(groups.standaloneByCategory.Juices);
    assert.equal(order.specialInstructions, "Lots of gravy");
  });

  it("includes fulfilled orders in operational history but only submitted can be fulfilled", () => {
    const fulfilled = makeOrder({
      id: "o5",
      status: "fulfilled",
      items: [{ name: "Meal", quantity: 1, itemType: "main", unitLabel: "Each", displayCategory: null }],
    });
    const providers = groupOperationalOrdersByProvider([...orders, fulfilled]);
    const total = providers.flatMap((provider) =>
      provider.offices.flatMap((office) => office.orders),
    ).length;
    assert.equal(total, 5);
    assert.equal(canFulfillOperationalOrder(fulfilled), false);
    assert.equal(canFulfillOperationalOrder(orders[0]!), true);
  });
});

describe("delivery date vs order date", () => {
  it("keeps lunch-period membership on order date, not delivery date", () => {
    assert.equal(
      orderDateBelongsToPeriod("2099-01-05", {
        start_date: "2099-01-01",
        end_date: "2099-01-11",
      }),
      true,
    );
    assert.equal(
      orderDateBelongsToPeriod("2099-01-06", {
        start_date: "2099-01-01",
        end_date: "2099-01-05",
      }),
      false,
    );
  });

  it("tracks delivery date separately from order date on each order", () => {
    const mondayOrder = makeOrder({
      id: "mon",
      orderDate: "2099-01-05",
      deliveryDate: "2099-01-06",
    });
    assert.equal(mondayOrder.orderDate, "2099-01-05");
    assert.equal(mondayOrder.deliveryDate, "2099-01-06");
    assert.notEqual(mondayOrder.orderDate, mondayOrder.deliveryDate);

    const report = buildOperationalDeliveryReport([mondayOrder], "2099-01-06");
    assert.equal(report.totalOrders, 1);
    assert.equal(report.deliveryDate, "2099-01-06");
  });
});

describe("provider print payload privacy", () => {
  it("includes only operational fields and excludes financial/account metadata", () => {
    const order = makeOrder({
      id: "print-1",
      employeeName: "Jane Smith",
      specialInstructions: "No onions",
      items: [
        { name: "Fried Chicken", quantity: 1, itemType: "main", unitLabel: "Each", displayCategory: null },
      ],
    });

    const payload = {
      provider: order.providerName,
      deliveryDate: order.deliveryDate,
      offices: [
        {
          name: order.officeLocationName,
          orders: [toProviderPrintOrder(order)],
        },
      ],
    };

    assert.doesNotThrow(() => assertProviderPrintPayloadSafe(payload));
    assert.equal(payload.offices[0]?.orders[0]?.employeeName, "Jane Smith");
    assert.equal("email" in payload, false);
    assert.equal("unit_price" in (payload.offices[0]?.orders[0] ?? {}), false);
  });

  it("rejects payloads containing forbidden account/financial keys", () => {
    assert.throws(
      () => assertProviderPrintPayloadSafe({ employee: { email: "secret@test.local" } }),
      /must not include email/,
    );
  });
});
