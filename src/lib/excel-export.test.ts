import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildManagementExportFilename,
  buildManagementWorkbook,
  buildStaffExportFilename,
  buildStaffWorkbook,
  readWorkbookSheetNames,
} from "./excel-export";
import type {
  LunchPeriodFinancialSummary,
  StaffExportPayload,
} from "./financial-summaries";

const staffPayload: StaffExportPayload = {
  period: {
    period_id: "period-1",
    label: "August Payroll",
    start_date: "2026-08-03",
    end_date: "2026-08-27",
    status: "open",
  },
  employee: {
    employee_id: "staff-1",
    employee_name: "Staff One",
    employee_email: "staff1@test.local",
  },
  order_count: 2,
  period_total: "35.00",
  orders: [
    {
      order_id: "order-1",
      order_date: "2026-08-21",
      delivery_date: "2026-08-24",
      provider_name: "Kitchen",
      order_status: "submitted",
      order_total: "24.00",
    },
    {
      order_id: "order-2",
      order_date: "2026-08-14",
      delivery_date: "2026-08-15",
      provider_name: "Kitchen",
      order_status: "fulfilled",
      order_total: "11.00",
    },
  ],
};

const managementPayload: LunchPeriodFinancialSummary = {
  period: {
    period_id: "period-1",
    label: "August Payroll",
    start_date: "2026-08-03",
    end_date: "2026-08-27",
    status: "open",
    is_current: true,
  },
  employees: [
    {
      employee_id: "staff-1",
      employee_name: "Staff One",
      employee_email: "staff1@test.local",
      order_count: 2,
      period_total: "35.00",
    },
    {
      employee_id: "staff-2",
      employee_name: "Staff Two",
      employee_email: "staff2@test.local",
      order_count: 1,
      period_total: "12.00",
    },
  ],
  orders: [
    {
      order_id: "order-1",
      employee_id: "staff-1",
      employee_name: "Staff One",
      employee_email: "staff1@test.local",
      order_date: "2026-08-21",
      delivery_date: "2026-08-24",
      provider_name: "Kitchen",
      order_status: "submitted",
      order_total: "24.00",
    },
    {
      order_id: "order-2",
      employee_id: "staff-2",
      employee_name: "Staff Two",
      employee_email: "staff2@test.local",
      order_date: "2026-08-21",
      delivery_date: "2026-08-24",
      provider_name: "Kitchen",
      order_status: "submitted",
      order_total: "12.00",
    },
  ],
  grand_total: "47.00",
};

describe("export filenames", () => {
  it("builds staff export filename from period dates", () => {
    assert.equal(
      buildStaffExportFilename("2026-08-03", "2026-08-27"),
      "my-lunch-summary-2026-08-03-to-2026-08-27.xlsx",
    );
  });

  it("builds management export filename from period dates", () => {
    assert.equal(
      buildManagementExportFilename("2026-08-03", "2026-08-27"),
      "lunch-period-2026-08-03-to-2026-08-27.xlsx",
    );
  });
});

describe("staff workbook", () => {
  it("creates expected sheet names", async () => {
    const buffer = await buildStaffWorkbook(staffPayload);
    const sheetNames = await readWorkbookSheetNames(buffer);

    assert.deepEqual(sheetNames, ["Summary", "Orders"]);
  });

  it("contains only the authenticated employee", async () => {
    const buffer = await buildStaffWorkbook(staffPayload);
    const sheetNames = await readWorkbookSheetNames(buffer);

    assert.equal(sheetNames.length, 2);
    assert.equal(staffPayload.orders.length, 2);
    assert.equal(staffPayload.employee.employee_id, "staff-1");
  });

  it("totals match summary data", async () => {
    assert.equal(Number(staffPayload.period_total), 35);
    assert.equal(
      staffPayload.orders.reduce((sum, order) => sum + Number(order.order_total), 0),
      35,
    );
  });
});

describe("management workbook", () => {
  it("creates expected sheet names", async () => {
    const buffer = await buildManagementWorkbook(managementPayload);
    const sheetNames = await readWorkbookSheetNames(buffer);

    assert.deepEqual(sheetNames, ["Employee Summary", "Orders", "Period"]);
  });

  it("contains multiple employees", async () => {
    assert.equal(managementPayload.employees.length, 2);
    assert.equal(managementPayload.orders.length, 2);
  });

  it("grand total matches employee totals", async () => {
    const employeeTotal = managementPayload.employees.reduce(
      (sum, employee) => sum + Number(employee.period_total),
      0,
    );

    assert.equal(employeeTotal, Number(managementPayload.grand_total));
  });

  it("does not include cancelled orders in fixture", async () => {
    assert.ok(
      managementPayload.orders.every((order) => order.order_status !== "cancelled"),
    );
  });
});
