import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildOrderHistoryUrl,
  compareOrdersNewestFirst,
  EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT,
  isEmployeeHistoryMode,
  ORDER_HISTORY_ALL_DATES,
  parseOrderHistoryFilters,
  shouldShowEmployeeHistoryTable,
  shouldShowProviderGroupedResults,
  sortOrdersForEmployeeHistory,
  formatOrderHistoryTimelineDate,
  formatOrderHistoryTimelineProviderOffice,
} from "./order-history";
import type { OperationalOrder } from "./operational-orders";

function makeOrder(
  overrides: Partial<OperationalOrder> & Pick<OperationalOrder, "id">,
): OperationalOrder {
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
    mealQuantity: 1,
    employeeName: "Staff One",
    officeLocationName: "Camp Road",
    officeLocationAddress: null,
    orderDate: "2026-01-01",
    deliveryDate: "2026-01-02",
    providerId: "p1",
    providerName: "Alberries Caterors",
    items: [],
    isLateOrder: false,
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
    ...overrides,
  };
}

describe("order history filters", () => {
  it("parses URL filters including all dates and employee", () => {
    const filters = parseOrderHistoryFilters({
      deliveryDate: ORDER_HISTORY_ALL_DATES,
      provider: "p1",
      location: "Camp Road",
      reconciliation: "issues",
      employee: "emp-1",
      defaultDeliveryDate: "2026-09-23",
    });

    assert.equal(filters.deliveryDate, ORDER_HISTORY_ALL_DATES);
    assert.equal(filters.providerId, "p1");
    assert.equal(filters.officeLocation, "Camp Road");
    assert.equal(filters.reconciliationStatus, "issues");
    assert.equal(filters.employeeId, "emp-1");
  });

  it("builds shareable order history URLs", () => {
    const url = buildOrderHistoryUrl({
      deliveryDate: ORDER_HISTORY_ALL_DATES,
      providerId: "p1",
      officeLocation: "",
      reconciliationStatus: "all",
      employeeId: "emp-1",
    });

    assert.match(url, /deliveryDate=all/);
    assert.match(url, /provider=p1/);
    assert.match(url, /employee=emp-1/);
  });

  it("detects employee history mode", () => {
    assert.equal(
      isEmployeeHistoryMode({
        deliveryDate: ORDER_HISTORY_ALL_DATES,
        providerId: "",
        officeLocation: "",
        reconciliationStatus: "all",
        employeeId: "emp-1",
      }),
      true,
    );
    assert.equal(
      isEmployeeHistoryMode({
        deliveryDate: "2026-09-23",
        providerId: "",
        officeLocation: "",
        reconciliationStatus: "all",
        employeeId: "emp-1",
      }),
      false,
    );
  });

  it("chooses employee table vs provider cards by date and employee", () => {
    const allDatesEmployee = {
      deliveryDate: ORDER_HISTORY_ALL_DATES,
      providerId: "",
      officeLocation: "",
      reconciliationStatus: "all" as const,
      employeeId: "emp-1",
    };
    const specificDateEmployee = {
      ...allDatesEmployee,
      deliveryDate: "2026-09-23",
    };
    const specificDateNoEmployee = {
      ...specificDateEmployee,
      employeeId: "",
    };

    assert.equal(shouldShowEmployeeHistoryTable(allDatesEmployee), true);
    assert.equal(shouldShowProviderGroupedResults(allDatesEmployee), false);

    assert.equal(shouldShowEmployeeHistoryTable(specificDateEmployee), false);
    assert.equal(shouldShowProviderGroupedResults(specificDateEmployee), true);

    assert.equal(shouldShowEmployeeHistoryTable(specificDateNoEmployee), false);
    assert.equal(shouldShowProviderGroupedResults(specificDateNoEmployee), true);

    const allDatesNoEmployee = {
      ...allDatesEmployee,
      employeeId: "",
    };
    assert.equal(shouldShowEmployeeHistoryTable(allDatesNoEmployee), false);
    assert.equal(shouldShowProviderGroupedResults(allDatesNoEmployee), true);
  });
});

describe("employee order history ordering", () => {
  it("sorts newest delivery dates first", () => {
    const sorted = sortOrdersForEmployeeHistory([
      makeOrder({ id: "o1", deliveryDate: "2026-09-20", createdAt: "2026-09-19T12:00:00Z" }),
      makeOrder({ id: "o2", deliveryDate: "2026-09-23", createdAt: "2026-09-22T12:00:00Z" }),
    ]);

    assert.equal(sorted[0]?.id, "o2");
    assert.ok(compareOrdersNewestFirst(sorted[0]!, sorted[1]!) < 0);
  });

  it("limits drawer employee history to five orders", () => {
    assert.equal(EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT, 5);
  });

  it("formats compact timeline date and provider office lines", () => {
    assert.match(formatOrderHistoryTimelineDate("2026-09-25"), /Sep/);
    assert.match(formatOrderHistoryTimelineDate("2026-09-25"), /25/);
    assert.equal(
      formatOrderHistoryTimelineProviderOffice("Alberries Caterors", "Camp Road"),
      "Alberries Caterors · Camp Road",
    );
    assert.equal(formatOrderHistoryTimelineProviderOffice("Peel Good Food", null), "Peel Good Food");
  });
});

describe("order history presentation wiring", () => {
  it("uses compact tables and drawer without preparation summaries", () => {
    const workspace = readFileSync(
      new URL("../components/admin/order-history-workspace.tsx", import.meta.url),
      "utf8",
    );
    const drawer = readFileSync(
      new URL("../components/admin/order-history-detail-drawer.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /EmployeePicker/);
    assert.match(workspace, /shouldShowEmployeeHistoryTable/);
    assert.match(workspace, /shouldShowProviderGroupedResults/);
    assert.match(workspace, /showProviderCards/);
    assert.doesNotMatch(workspace, /View preparation summary/);
    assert.doesNotMatch(workspace, /PreparationSummaryToggle/);
    assert.match(workspace, /ProviderOfficeTable/);
    assert.match(workspace, /border-t-4 border-t-primary/);
    assert.match(workspace, /TealIconWell/);
    assert.match(workspace, /IconUtensils/);
    assert.match(workspace, /OrderHistoryDetailDrawer/);
    assert.doesNotMatch(workspace, /OperationalOrderCard/);
    assert.doesNotMatch(workspace, /DeliveryReconciliationActions/);
    assert.doesNotMatch(workspace, /bg-amber-50/);

    assert.match(drawer, /DeliveryIssuePanelForm/);
    assert.match(drawer, /Employee order history/);
    assert.match(drawer, /MetadataSummaryField/);
    assert.match(drawer, /orderHistoryTimelineDotClassName/);
    assert.match(drawer, /handleSelectHistoryOrder/);
    assert.match(drawer, /onSelectHistoryOrder/);
    assert.match(drawer, /currentOrderId/);
    assert.match(drawer, /scrollContainerRef/);
    assert.match(drawer, /scrollTo\(\{ top: 0/);
    assert.match(drawer, /orderId === order\?\.id/);
    assert.match(drawer, /aria-current=\{isSelected/);
    assert.match(drawer, /formatOrderHistoryTimelineDate/);
    assert.match(drawer, /loadEmployeeRecentOrderHistory/);
    assert.doesNotMatch(drawer, /recentEmployeeOrders/);
    assert.match(drawer, /Special instructions/);

    const recentLoader = readFileSync(
      new URL("../app/admin/orders/load-employee-recent-orders.ts", import.meta.url),
      "utf8",
    );

    assert.match(recentLoader, /requireViewAllOrders/);
    assert.match(recentLoader, /profile_id/);
    assert.match(recentLoader, /EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT/);
    assert.match(recentLoader, /OPERATIONAL_ORDERS_SELECT/);

    assert.match(page, /profile_id/);
    assert.match(page, /ORDER_HISTORY_ALL_DATES/);
    assert.match(page, /list_late_order_employee_profiles/);
    assert.doesNotMatch(page, /Open Deliveries workspace/);
    assert.doesNotMatch(page, /high-volume daily reconciliation/);
  });
});
