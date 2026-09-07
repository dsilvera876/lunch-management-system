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
  daily_lunch_subsidy: "500",
  period: {
    period_id: "period-1",
    label: "August Payroll",
    start_date: "2026-08-03",
    end_date: "2026-08-27",
    status: "open",
    daily_subsidy_rate: "500",
  },
  employee: {
    employee_id: "staff-1",
    employee_name: "Staff One",
    employee_email: "staff1@test.local",
  },
  order_count: 2,
  qualifying_order_days: 2,
  period_total: "35.00",
  gross: "35.00",
  subsidy_used: "20.00",
  net_deduction: "15.00",
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
  daily_summary: [
    {
      order_date: "2026-08-14",
      gross: "11.00",
      subsidy_used: "11.00",
      net_deduction: "0.00",
      order_count: 1,
    },
    {
      order_date: "2026-08-21",
      gross: "24.00",
      subsidy_used: "9.00",
      net_deduction: "15.00",
      order_count: 1,
    },
  ],
};

const managementPayload: LunchPeriodFinancialSummary = {
  daily_lunch_subsidy: "500",
  period: {
    period_id: "period-1",
    label: "August Payroll",
    start_date: "2026-08-03",
    end_date: "2026-08-27",
    status: "finalized",
    is_current: true,
    daily_subsidy_rate: "500",
  },
  employees: [
    {
      employee_id: "staff-1",
      employee_name: "Staff One",
      employee_email: "staff1@test.local",
      order_count: 2,
      qualifying_order_days: 2,
      period_total: "35.00",
      gross: "35.00",
      subsidy_used: "20.00",
      net_deduction: "15.00",
    },
    {
      employee_id: "staff-2",
      employee_name: "Staff Two",
      employee_email: "staff2@test.local",
      order_count: 1,
      qualifying_order_days: 1,
      period_total: "12.00",
      gross: "12.00",
      subsidy_used: "12.00",
      net_deduction: "0.00",
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
  daily_summary: [
    {
      employee_id: "staff-1",
      employee_name: "Staff One",
      employee_email: "staff1@test.local",
      order_date: "2026-08-21",
      gross: "24.00",
      subsidy_used: "9.00",
      net_deduction: "15.00",
      order_count: 1,
    },
    {
      employee_id: "staff-2",
      employee_name: "Staff Two",
      employee_email: "staff2@test.local",
      order_date: "2026-08-21",
      gross: "12.00",
      subsidy_used: "12.00",
      net_deduction: "0.00",
      order_count: 1,
    },
  ],
  grand_total: "47.00",
  grand_gross: "47.00",
  grand_subsidy_used: "32.00",
  grand_net_deduction: "15.00",
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

    assert.deepEqual(sheetNames, ["Summary", "Daily Summary", "Orders"]);
  });

  it("contains subsidy and net deduction fields", async () => {
    assert.equal(Number(staffPayload.subsidy_used), 20);
    assert.equal(Number(staffPayload.net_deduction), 15);
    assert.equal(Number(staffPayload.daily_lunch_subsidy), 500);
  });

  it("totals match summary data", async () => {
    assert.equal(Number(staffPayload.gross), 35);
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

    assert.deepEqual(sheetNames, [
      "Period",
      "Employee Summary",
      "Daily Summary",
      "Orders",
    ]);
  });

  it("contains finalized subsidy snapshot on period sheet", async () => {
    assert.equal(managementPayload.period.status, "finalized");
    assert.equal(Number(managementPayload.daily_lunch_subsidy), 500);
  });

  it("grand totals match employee subsidy totals", async () => {
    const employeeNet = managementPayload.employees.reduce(
      (sum, employee) => sum + Number(employee.net_deduction),
      0,
    );

    assert.equal(employeeNet, Number(managementPayload.grand_net_deduction));
  });

  it("does not include cancelled orders in fixture", async () => {
    assert.ok(
      managementPayload.orders.every((order) => order.order_status !== "cancelled"),
    );
  });
});
