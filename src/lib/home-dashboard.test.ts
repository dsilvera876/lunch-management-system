import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCurrentOrdersState,
  getCurrentSpendState,
  getLocationDisplay,
  getProviderSetupMessage,
} from "./home-dashboard";
import type { StaffFinancialDashboard } from "./financial-summaries";

const dashboardWithoutPeriod: StaffFinancialDashboard = {
  daily_lunch_subsidy: 500,
  today: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  current_month: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  today_total: 0,
  current_month_total: 0,
  recent_months: [],
  current_period: null,
};

const dashboardWithPeriod: StaffFinancialDashboard = {
  daily_lunch_subsidy: 500,
  today: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  current_month: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  today_total: 0,
  current_month_total: 0,
  recent_months: [],
  current_period: {
    period_id: "123",
    label: "Current Period",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    status: "open",
    daily_subsidy_rate: 500,
    order_count: 5,
    qualifying_order_days: 1,
    period_total: 4540,
    gross: 4540,
    subsidy_used: 500,
    net_deduction: 4040,
    orders: [],
    daily_summary: [],
  },
};

describe("fresh-user Home states", () => {
  it("shows an empty current-orders state for zero orders", () => {
    assert.deepEqual(getCurrentOrdersState(0, 0), { status: "empty" });
  });

  it("shows no current period without inventing a deduction", () => {
    assert.deepEqual(getCurrentSpendState(dashboardWithoutPeriod), {
      status: "no-period",
      dailySubsidy: 500,
    });
  });

  it("shows current period deduction when a period is active", () => {
    assert.deepEqual(getCurrentSpendState(dashboardWithPeriod), {
      status: "ready",
      netDeduction: 4040,
      dailySubsidy: 500,
    });
  });

  it("identifies an empty provider setup", () => {
    assert.equal(getProviderSetupMessage(0), "No providers available");
    assert.equal(getProviderSetupMessage(1), null);
  });

  it("handles no office locations and no default location", () => {
    assert.equal(
      getLocationDisplay(0, null),
      "No office locations configured",
    );
    assert.equal(getLocationDisplay(2, null), "Select at checkout");
    assert.equal(getLocationDisplay(2, "Office 2"), "Office 2");
  });
});
