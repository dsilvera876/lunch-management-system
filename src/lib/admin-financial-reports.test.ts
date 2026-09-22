import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ADMIN_FINANCIAL_REPORTS_PAGE,
  buildFinancialGrandMetrics,
  FINANCIAL_EMPLOYEE_TABLE_LABELS,
  FINANCIAL_PERIOD_GRAND_METRIC_LABELS,
  FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX,
  getEffectivePeriodSubsidyAmount,
} from "./admin-financial-reports";
import type { LunchPeriodFinancialSummary } from "./financial-summaries";
import { getBreadcrumbs } from "./breadcrumbs";

const openSummary: LunchPeriodFinancialSummary = {
  daily_lunch_subsidy: 500,
  period: {
    period_id: "p-open",
    label: "September 2026",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    status: "open",
    is_current: true,
    daily_subsidy_rate: 500,
  },
  employees: [
    {
      employee_id: "e1",
      employee_name: "Alex",
      employee_email: "alex@example.com",
      order_count: 2,
      qualifying_order_days: 2,
      gross: 3000,
      subsidy_used: 1000,
      net_deduction: 2000,
      period_total: 2000,
    },
  ],
  orders: [],
  daily_summary: [],
  grand_total: 2000,
  grand_gross: 3000,
  grand_subsidy_used: 1000,
  grand_net_deduction: 2000,
};

const finalizedSummary: LunchPeriodFinancialSummary = {
  ...openSummary,
  daily_lunch_subsidy: 400,
  period: {
    ...openSummary.period,
    period_id: "p-final",
    status: "finalized",
    is_current: false,
    daily_subsidy_rate: 400,
  },
};

describe("admin financial reports presentation", () => {
  it("uses Financial Reports page copy", () => {
    assert.equal(ADMIN_FINANCIAL_REPORTS_PAGE.title, "Financial Reports");
    assert.match(ADMIN_FINANCIAL_REPORTS_PAGE.description, /order date/);
  });

  it("maps grand totals to payroll-friendly metric labels", () => {
    const metrics = buildFinancialGrandMetrics(openSummary);

    assert.deepEqual(
      metrics.map((metric) => metric.label),
      [
        FINANCIAL_PERIOD_GRAND_METRIC_LABELS.totalLunchCost,
        FINANCIAL_PERIOD_GRAND_METRIC_LABELS.companySubsidy,
        FINANCIAL_PERIOD_GRAND_METRIC_LABELS.salaryDeductions,
        FINANCIAL_PERIOD_GRAND_METRIC_LABELS.employeesWithOrders,
      ],
    );
    assert.equal(metrics[0].rawValue, openSummary.grand_gross);
    assert.equal(metrics[1].rawValue, openSummary.grand_subsidy_used);
    assert.equal(metrics[2].rawValue, openSummary.grand_net_deduction);
    assert.equal(metrics[3].rawValue, 1);
  });

  it("uses employee table labels aligned with payroll terminology", () => {
    assert.equal(FINANCIAL_EMPLOYEE_TABLE_LABELS.lunchCost, "Lunch Cost");
    assert.equal(FINANCIAL_EMPLOYEE_TABLE_LABELS.companySubsidy, "Company Subsidy");
    assert.equal(FINANCIAL_EMPLOYEE_TABLE_LABELS.salaryDeduction, "Salary Deduction");
  });

  it("displays effective period subsidy from summary payload", () => {
    assert.equal(getEffectivePeriodSubsidyAmount(openSummary), 500);
    assert.equal(getEffectivePeriodSubsidyAmount(finalizedSummary), 400);
  });

  it("labels read-only period subsidy copy for reports", () => {
    assert.match(FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX, /Daily subsidy used for calculations/);
  });

  it("wires financial reports UI without editable subsidy control", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/financials/page.tsx", import.meta.url),
      "utf8",
    );
    const reportSource = readFileSync(
      new URL("../components/admin/financial-reports/financial-period-report.tsx", import.meta.url),
      "utf8",
    );
    const employeeSource = readFileSync(
      new URL("../components/admin/financial-reports/financial-employee-totals.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /FinancialPeriodSelector/);
    assert.match(pageSource, /FinancialPeriodReport/);
    assert.match(pageSource, /FinancialEmployeeTotals/);
    assert.doesNotMatch(pageSource, /DailyLunchSubsidy/);
    assert.match(reportSource, /admin\/financials\/export\?periodId=/);
    assert.match(reportSource, /finalizeLunchPeriod/);
    assert.match(reportSource, /formatFinalizationBlockedMessage/);
    assert.match(reportSource, /FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX/);
    assert.match(employeeSource, /FINANCIAL_EMPLOYEE_TABLE_LABELS\.salaryDeduction/);
  });

  it("shows Financial Reports in admin breadcrumbs", () => {
    const crumbs = getBreadcrumbs("/admin/financials");
    assert.ok(crumbs.some((crumb) => crumb.label === "Financial Reports"));
    assert.ok(!crumbs.some((crumb) => crumb.label === "My Spend"));
  });
});

describe("lunch periods subsidy setting", () => {
  it("wires editable daily lunch subsidy on lunch periods page", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/lunch-periods/page.tsx", import.meta.url),
      "utf8",
    );
    const subsidySource = readFileSync(
      new URL("../components/daily-lunch-subsidy-control.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /DailyLunchSubsidySetting/);
    assert.match(pageSource, /getDailyLunchSubsidy/);
    assert.match(pageSource, /canUpdateDailyLunchSubsidy/);
    assert.match(subsidySource, /updateDailyLunchSubsidy/);
    assert.match(subsidySource, /Edit/);
  });
});
