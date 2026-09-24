import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildOperationalDeliveryReport,
  groupOperationalOrdersByProvider,
  type OperationalOrder,
} from "./operational-orders";
import {
  buildProviderPrintHref,
  buildTodaysOrdersSummaryMetrics,
  flattenProviderOrders,
  formatProviderLocationSubtitle,
  formatTodaysOrderDetailLines,
  formatTodaysOrderDisplayDate,
  getTodaysOrderStatusLabel,
  providerHasMultipleLocations,
  resolveProviderPrintDeliveryDate,
} from "./todays-orders-presentation";

function makeOrder(overrides: Partial<OperationalOrder> & Pick<OperationalOrder, "id">): OperationalOrder {
  return {
    profileId: "profile-1",
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
    officeLocationName: "Camp Road",
    officeLocationAddress: null,
    orderDate: "2026-09-22",
    deliveryDate: "2026-09-23",
    providerId: "p1",
    providerName: "Alberries Caterors",
    items: [],
    isLateOrder: false,
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
    ...overrides,
  };
}

describe("today's orders presentation", () => {
  const orders: OperationalOrder[] = [
    makeOrder({
      id: "o1",
      items: [
        { name: "BBQ Chicken", quantity: 1, itemType: "main", unitLabel: "Each", displayCategory: null },
        { name: "Rice and peas", quantity: 1, itemType: "side", unitLabel: "Each", displayCategory: null },
      ],
    }),
    makeOrder({
      id: "o2",
      providerId: "p2",
      providerName: "Peel Good Food",
      officeLocationName: "Camp Road",
      items: [{ name: "Banana", quantity: 4, itemType: "standalone", unitLabel: "Each", displayCategory: "Fruit" }],
    }),
    makeOrder({
      id: "o3",
      status: "cancelled",
      deliveryState: "resolved",
      financialDisposition: "waived",
      items: [{ name: "BBQ Chicken", quantity: 99, itemType: "main", unitLabel: "Each", displayCategory: null }],
    }),
  ];

  const report = buildOperationalDeliveryReport(orders, "2026-09-22");

  it("builds order and provider summary counts", () => {
    const metrics = buildTodaysOrdersSummaryMetrics(report);
    assert.equal(metrics.orderCount, 3);
    assert.equal(metrics.providerCount, 2);
  });

  it("formats single-location provider subtitle", () => {
    const provider = groupOperationalOrdersByProvider(orders)[0];
    assert.ok(provider);
    assert.equal(formatProviderLocationSubtitle(provider.officeSummaries), "Camp Road · 1 order");
  });

  it("detects multi-location providers for table columns", () => {
    const multiOfficeOrder = makeOrder({
      id: "o4",
      officeLocationName: "Kingston",
    });
    const provider = groupOperationalOrdersByProvider([orders[0]!, multiOfficeOrder])[0];
    assert.ok(provider);
    assert.equal(providerHasMultipleLocations(provider), true);
    assert.match(formatProviderLocationSubtitle(provider.officeSummaries), /2 locations/);
  });

  it("excludes cancelled orders from preparation totals while keeping employee rows", () => {
    const provider = groupOperationalOrdersByProvider(orders)[0];
    assert.ok(provider);
    const mains = provider.preparationSections.find((section) => section.label === "Mains");
    assert.equal(mains?.lines.find((line) => line.name === "BBQ Chicken")?.quantity, 1);
    assert.equal(flattenProviderOrders(provider).length, 2);
  });

  it("maps operational status labels", () => {
    assert.equal(getTodaysOrderStatusLabel(orders[0]!), "Pending");
    assert.equal(getTodaysOrderStatusLabel(orders[2]!), "Cancelled");
  });

  it("formats friendly order and delivery dates", () => {
    assert.equal(formatTodaysOrderDisplayDate("2026-09-22"), "Sep 22, 2026");
    assert.equal(formatTodaysOrderDisplayDate("2026-09-23"), "Sep 23, 2026");
  });

  it("formats concise employee order detail lines", () => {
    const lines = formatTodaysOrderDetailLines(orders[0]!);
    assert.deepEqual(lines, ["BBQ Chicken × 1", "Rice and peas × 1"]);
  });

  it("uses scheduled delivery date for print href, not order date", () => {
    const provider = groupOperationalOrdersByProvider(orders)[0];
    assert.ok(provider);
    assert.equal(resolveProviderPrintDeliveryDate(provider), "2026-09-23");
    assert.equal(
      buildProviderPrintHref(provider.providerId, resolveProviderPrintDeliveryDate(provider)),
      "/admin/deliveries/provider/p1/print?deliveryDate=2026-09-23",
    );
  });

  it("wires today's orders page to new presentation components", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/todays-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const cardSource = readFileSync(
      new URL("../components/admin/todays-orders/todays-provider-orders-card.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /TodaysOrdersPageHeader/);
    assert.match(pageSource, /TodaysProviderOrdersCard/);
    assert.doesNotMatch(pageSource, /ProviderOperationalSection/);
    assert.match(cardSource, /buildProviderPrintHref/);
    assert.match(cardSource, /resolveProviderPrintDeliveryDate/);
    assert.doesNotMatch(pageSource, /deliveryDate=\{orderDate\}/);
    assert.match(cardSource, /TodaysPreparationSummary/);
    assert.match(cardSource, /TodaysEmployeeOrdersTable/);
  });
});
