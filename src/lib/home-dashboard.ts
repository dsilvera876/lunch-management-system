import type { StaffFinancialDashboard } from "@/lib/financial-summaries";

export type CurrentOrdersState =
  | { status: "empty" }
  | { status: "ready"; count: number; total: number };

export function getCurrentOrdersState(
  count: number,
  total: number,
): CurrentOrdersState {
  return count === 0
    ? { status: "empty" }
    : { status: "ready", count, total };
}

export type CurrentSpendState =
  | { status: "no-period"; dailySubsidy: number }
  | { status: "ready"; netDeduction: number; dailySubsidy: number };

export function getCurrentSpendState(
  dashboard: StaffFinancialDashboard,
): CurrentSpendState {
  const dailySubsidy = Number(dashboard.daily_lunch_subsidy);

  if (!dashboard.current_period) {
    return { status: "no-period", dailySubsidy };
  }

  return {
    status: "ready",
    netDeduction: Number(dashboard.current_period.net_deduction),
    dailySubsidy,
  };
}

export function getProviderSetupMessage(providerCount: number): string | null {
  return providerCount === 0 ? "No providers available" : null;
}

export function getLocationDisplay(
  activeLocationCount: number,
  defaultLocationName: string | null,
): string {
  if (activeLocationCount === 0) {
    return "No office locations configured";
  }

  return defaultLocationName ?? "Select at checkout";
}
