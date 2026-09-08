import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FinancialDashboardLoadError,
  getStaffFinancialDashboard,
  getStaffFinancialDashboardResult,
  type StaffFinancialDashboard,
} from "./financial-summaries";

const emptyDashboard: StaffFinancialDashboard = {
  daily_lunch_subsidy: 0,
  today: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  current_month: { gross: 0, subsidy_used: 0, net_deduction: 0 },
  today_total: 0,
  current_month_total: 0,
  recent_months: [],
  current_period: null,
};

function clientReturning(
  result: { data: unknown; error: unknown },
): SupabaseClient {
  return {
    rpc: async () => result,
  } as unknown as SupabaseClient;
}

describe("staff financial dashboard loading", () => {
  it("accepts no current lunch period as valid dashboard data", async () => {
    const dashboard = await getStaffFinancialDashboard(
      clientReturning({ data: emptyDashboard, error: null }),
    );

    assert.equal(dashboard.current_period, null);
    assert.equal(dashboard.today.net_deduction, 0);
  });

  it("preserves genuine RPC error details", async () => {
    await assert.rejects(
      getStaffFinancialDashboard(
        clientReturning({
          data: null,
          error: {
            code: "XX001",
            message: "database failure",
            details: "test details",
            hint: "test hint",
          },
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof FinancialDashboardLoadError);
        assert.equal(error.code, "XX001");
        assert.equal(error.details, "test details");
        return true;
      },
    );
  });

  it("reports an RPC failure for the optional Home card", async () => {
    const reported: FinancialDashboardLoadError[] = [];
    const result = await getStaffFinancialDashboardResult(
      clientReturning({
        data: null,
        error: { code: "XX002", message: "unavailable" },
      }),
      (error) => reported.push(error),
    );

    assert.equal(result.status, "error");
    assert.equal(reported.length, 1);
    assert.equal(reported[0].code, "XX002");
  });
});
