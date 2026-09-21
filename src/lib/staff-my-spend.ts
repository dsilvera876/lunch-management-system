import type {
  FinancialDailySummary,
  FinancialOrderLine,
  StaffCurrentPeriodSummary,
  StaffFinancialDashboard,
} from "@/lib/financial-summaries";

export type SpendScopeSummary = {
  netDeduction: number;
  qualifyingOrderDays: number;
  orderCount: number;
};

export type LunchDaySpendRow = {
  orderDate: string;
  providersLabel: string;
  orderCount: number;
  payrollDeduction: number;
};

export type StaffPeriodSpendSummary = Pick<
  StaffCurrentPeriodSummary,
  | "period_id"
  | "label"
  | "start_date"
  | "end_date"
  | "status"
  | "daily_subsidy_rate"
  | "net_deduction"
  | "qualifying_order_days"
  | "order_count"
>;

export function toNumber(value: string | number): number {
  return Number(value);
}

export function scopeFromAmountSummary(summary: {
  net_deduction: string | number;
  qualifying_order_days?: number;
  order_count?: number;
}): SpendScopeSummary {
  return {
    netDeduction: toNumber(summary.net_deduction),
    qualifyingOrderDays: Number(summary.qualifying_order_days ?? 0),
    orderCount: Number(summary.order_count ?? 0),
  };
}

export function formatLunchDayCount(count: number): string {
  return `${count} lunch ${count === 1 ? "day" : "days"}`;
}

export function summarizeProvidersForDate(
  orders: FinancialOrderLine[],
  orderDate: string,
): string {
  const names = [
    ...new Set(
      orders
        .filter((order) => order.order_date === orderDate)
        .map((order) => order.provider_name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  if (names.length === 0) {
    return "—";
  }

  return names.join(", ");
}

export function buildLunchDaySpendRows(
  dailySummary: FinancialDailySummary[],
  orders: FinancialOrderLine[],
): LunchDaySpendRow[] {
  return [...dailySummary]
    .sort((left, right) => right.order_date.localeCompare(left.order_date))
    .map((day) => ({
      orderDate: day.order_date,
      providersLabel: summarizeProvidersForDate(orders, day.order_date),
      orderCount: Number(day.order_count),
      payrollDeduction: toNumber(day.net_deduction),
    }));
}

export function selectPeriodForLunchDays(
  dashboard: StaffFinancialDashboard,
  periodKey: "current" | "previous",
): StaffCurrentPeriodSummary | null {
  if (periodKey === "previous") {
    return normalizePeriodForLunchDays(dashboard.previous_period);
  }

  return dashboard.current_period;
}

export function normalizePeriodForLunchDays(
  period: StaffFinancialDashboard["previous_period"],
): StaffCurrentPeriodSummary | null {
  if (!period) {
    return null;
  }

  return {
    ...period,
    orders: period.orders ?? [],
    daily_summary: period.daily_summary ?? [],
  };
}

export function getLastLunchPeriodCardSummary(
  dashboard: StaffFinancialDashboard,
): SpendScopeSummary | null {
  const previous = dashboard.previous_period;
  if (!previous) {
    return null;
  }

  return {
    netDeduction: toNumber(previous.net_deduction),
    qualifyingOrderDays: Number(previous.qualifying_order_days),
    orderCount: Number(previous.order_count),
  };
}

export function periodSummaryFromDashboard(
  period: StaffCurrentPeriodSummary | null,
): StaffPeriodSpendSummary | null {
  if (!period) {
    return null;
  }

  return {
    period_id: period.period_id,
    label: period.label,
    start_date: period.start_date,
    end_date: period.end_date,
    status: period.status,
    daily_subsidy_rate: period.daily_subsidy_rate,
    net_deduction: period.net_deduction,
    qualifying_order_days: period.qualifying_order_days,
    order_count: period.order_count,
  };
}
