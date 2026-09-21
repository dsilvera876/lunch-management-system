import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLunchDaySpendRows,
  formatLunchDayCount,
  getLastLunchPeriodCardSummary,
  periodSummaryFromDashboard,
  scopeFromAmountSummary,
  summarizeProvidersForDate,
} from "./staff-my-spend";
import type { StaffFinancialDashboard } from "./financial-summaries";

describe("staff my spend shaping", () => {
  it("maps salary deduction from net_deduction", () => {
    assert.deepEqual(
      scopeFromAmountSummary({
        net_deduction: "350.00",
        qualifying_order_days: 1,
        order_count: 2,
      }),
      {
        netDeduction: 350,
        qualifyingOrderDays: 1,
        orderCount: 2,
      },
    );
  });

  it("formats lunch day counts", () => {
    assert.equal(formatLunchDayCount(1), "1 lunch day");
    assert.equal(formatLunchDayCount(4), "4 lunch days");
  });

  it("groups multiple providers on the same order date", () => {
    const label = summarizeProvidersForDate(
      [
        {
          order_id: "1",
          order_date: "2026-09-18",
          delivery_date: "2026-09-19",
          provider_name: "Alberries Caterors",
          order_status: "submitted",
          order_total: 850,
        },
        {
          order_id: "2",
          order_date: "2026-09-18",
          delivery_date: "2026-09-19",
          provider_name: "Peel Good Food",
          order_status: "submitted",
          order_total: 200,
        },
      ],
      "2026-09-18",
    );

    assert.equal(label, "Alberries Caterors, Peel Good Food");
  });

  it("builds lunch-day rows from daily subsidy breakdown and orders", () => {
    const rows = buildLunchDaySpendRows(
      [
        {
          order_date: "2026-09-17",
          gross: 1000,
          subsidy_used: 500,
          net_deduction: 500,
          order_count: 1,
        },
        {
          order_date: "2026-09-18",
          gross: 1050,
          subsidy_used: 500,
          net_deduction: 550,
          order_count: 2,
        },
      ],
      [
        {
          order_id: "a",
          order_date: "2026-09-18",
          delivery_date: "2026-09-19",
          provider_name: "Alberries Caterors",
          order_status: "submitted",
          order_total: 850,
        },
        {
          order_id: "b",
          order_date: "2026-09-18",
          delivery_date: "2026-09-19",
          provider_name: "Peel Good Food",
          order_status: "submitted",
          order_total: 200,
        },
      ],
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.orderDate, "2026-09-18");
    assert.equal(rows[0]?.payrollDeduction, 550);
    assert.equal(rows[0]?.orderCount, 2);
    assert.match(rows[0]?.providersLabel ?? "", /Alberries/);
  });

  it("uses previous lunch period for the last-period card", () => {
    const dashboard = {
      daily_lunch_subsidy: 500,
      today: { gross: 0, subsidy_used: 0, net_deduction: 0, qualifying_order_days: 0, order_count: 0 },
      current_week: { gross: 0, subsidy_used: 0, net_deduction: 0, qualifying_order_days: 0, order_count: 0 },
      current_month: { gross: 0, subsidy_used: 0, net_deduction: 0, qualifying_order_days: 0, order_count: 0 },
      today_total: 0,
      current_month_total: 0,
      recent_months: [],
      current_period: null,
      previous_period: {
        period_id: "p1",
        label: "Dev Previous Payroll",
        start_date: "2026-08-01",
        end_date: "2026-08-28",
        status: "finalized",
        daily_subsidy_rate: 500,
        order_count: 3,
        qualifying_order_days: 2,
        period_total: 2000,
        gross: 2000,
        subsidy_used: 1000,
        net_deduction: 1000,
        orders: [],
        daily_summary: [],
      },
    } satisfies StaffFinancialDashboard;

    assert.deepEqual(getLastLunchPeriodCardSummary(dashboard), {
      netDeduction: 1000,
      qualifyingOrderDays: 2,
      orderCount: 3,
    });
  });

  it("includes period daily subsidy rate in period summaries", () => {
    const summary = periodSummaryFromDashboard({
      period_id: "p1",
      label: "September",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      status: "open",
      daily_subsidy_rate: 500,
      order_count: 1,
      qualifying_order_days: 1,
      period_total: 850,
      gross: 850,
      subsidy_used: 500,
      net_deduction: 350,
      orders: [],
      daily_summary: [],
    });

    assert.equal(summary?.daily_subsidy_rate, 500);
  });

  it("returns zero-friendly scopes for empty spend", () => {
    assert.deepEqual(
      scopeFromAmountSummary({ net_deduction: 0 }),
      {
        netDeduction: 0,
        qualifyingOrderDays: 0,
        orderCount: 0,
      },
    );
  });
});
