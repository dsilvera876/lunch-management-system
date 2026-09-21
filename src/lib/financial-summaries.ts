import type { SupabaseClient } from "@supabase/supabase-js";

export type LunchPeriodStatus = "open" | "finalized";

export type FinancialAmountSummary = {
  gross: string | number;
  subsidy_used: string | number;
  net_deduction: string | number;
};

export type FinancialScopeAmountSummary = FinancialAmountSummary & {
  qualifying_order_days?: number;
  order_count?: number;
  start_date?: string;
  end_date?: string;
};

export type FinancialOrderLine = {
  order_id: string;
  order_date: string;
  delivery_date: string;
  provider_name: string | null;
  order_status: string;
  order_total: string | number;
  office_location_name?: string | null;
  office_location_address?: string | null;
};

export type FinancialDailySummary = {
  order_date: string;
  gross: string | number;
  subsidy_used: string | number;
  net_deduction: string | number;
  order_count: number;
};

export type FinancialMonthSummary = FinancialAmountSummary & {
  year: number;
  month: number;
  label: string;
  start_date: string;
  end_date: string;
  total: string | number;
};

export type StaffCurrentPeriodSummary = FinancialAmountSummary & {
  period_id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: LunchPeriodStatus;
  daily_subsidy_rate: string | number;
  order_count: number;
  qualifying_order_days: number;
  period_total: string | number;
  orders: FinancialOrderLine[];
  daily_summary: FinancialDailySummary[];
};

export type StaffPreviousPeriodSummary = Omit<
  StaffCurrentPeriodSummary,
  "orders" | "daily_summary"
> & {
  orders?: FinancialOrderLine[];
  daily_summary?: FinancialDailySummary[];
};

export type StaffFinancialDashboard = {
  daily_lunch_subsidy: string | number;
  today: FinancialScopeAmountSummary;
  current_week: FinancialScopeAmountSummary;
  current_month: FinancialScopeAmountSummary;
  today_total: string | number;
  current_month_total: string | number;
  recent_months: FinancialMonthSummary[];
  current_period: StaffCurrentPeriodSummary | null;
  previous_period: StaffPreviousPeriodSummary | null;
};

type FinancialRpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export class FinancialDashboardLoadError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(error: FinancialRpcError | null) {
    super("Unable to load financial summaries.", { cause: error ?? undefined });
    this.name = "FinancialDashboardLoadError";
    this.code = error?.code ?? null;
    this.details = error?.details ?? null;
    this.hint = error?.hint ?? null;
  }
}

export type StaffFinancialDashboardResult =
  | { status: "ready"; dashboard: StaffFinancialDashboard }
  | { status: "error"; error: FinancialDashboardLoadError };

export type ManagementEmployeeSummary = FinancialAmountSummary & {
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
  order_count: number;
  qualifying_order_days: number;
  period_total: string | number;
};

export type ManagementOrderLine = FinancialOrderLine & {
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
};

export type ManagementDailySummary = FinancialDailySummary & {
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
};

export type LunchPeriodFinancialSummary = {
  daily_lunch_subsidy: string | number;
  period: {
    period_id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: LunchPeriodStatus;
    is_current: boolean;
    daily_subsidy_rate: string | number;
  };
  employees: ManagementEmployeeSummary[];
  orders: ManagementOrderLine[];
  daily_summary: ManagementDailySummary[];
  grand_total: string | number;
  grand_gross: string | number;
  grand_subsidy_used: string | number;
  grand_net_deduction: string | number;
};

export type StaffExportPayload = {
  daily_lunch_subsidy: string | number;
  period: {
    period_id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: LunchPeriodStatus;
    daily_subsidy_rate: string | number;
  };
  employee: {
    employee_id: string;
    employee_name: string | null;
    employee_email: string | null;
  };
  order_count: number;
  qualifying_order_days: number;
  period_total: string | number;
  gross: string | number;
  subsidy_used: string | number;
  net_deduction: string | number;
  orders: FinancialOrderLine[];
  daily_summary: FinancialDailySummary[];
};

export async function getDailyLunchSubsidy(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_daily_lunch_subsidy");

  if (error) {
    throw new Error("Unable to load daily lunch subsidy.");
  }

  return Number(data);
}

export async function getStaffFinancialDashboard(
  supabase: SupabaseClient,
): Promise<StaffFinancialDashboard> {
  const { data, error } = await supabase.rpc("get_my_financial_dashboard");

  if (error || data === null) {
    throw new FinancialDashboardLoadError(error);
  }

  return data as StaffFinancialDashboard;
}

export async function getStaffFinancialDashboardResult(
  supabase: SupabaseClient,
  reportError: (error: FinancialDashboardLoadError) => void = console.error,
): Promise<StaffFinancialDashboardResult> {
  try {
    return {
      status: "ready",
      dashboard: await getStaffFinancialDashboard(supabase),
    };
  } catch (error) {
    const dashboardError =
      error instanceof FinancialDashboardLoadError
        ? error
        : new FinancialDashboardLoadError({
            message: error instanceof Error ? error.message : String(error),
          });

    reportError(dashboardError);
    return { status: "error", error: dashboardError };
  }
}

export async function getLunchPeriodFinancialSummary(
  supabase: SupabaseClient,
  periodId: string,
): Promise<LunchPeriodFinancialSummary> {
  const { data, error } = await supabase.rpc("get_lunch_period_financial_summary", {
    p_period_id: periodId,
  });

  if (error) {
    throw new Error("Unable to load lunch period financial summary.");
  }

  return data as LunchPeriodFinancialSummary;
}

export async function getStaffExportPayload(
  supabase: SupabaseClient,
): Promise<StaffExportPayload> {
  const { data, error } = await supabase.rpc("get_my_lunch_period_export_data");

  if (error) {
    throw new Error(error.message || "Unable to load export data.");
  }

  return data as StaffExportPayload;
}

export async function getManagementExportPayload(
  supabase: SupabaseClient,
  periodId: string,
): Promise<LunchPeriodFinancialSummary> {
  const { data, error } = await supabase.rpc("get_lunch_period_export_data", {
    p_period_id: periodId,
  });

  if (error) {
    throw new Error(error.message || "Unable to load export data.");
  }

  return data as LunchPeriodFinancialSummary;
}

export function sumNumericValues(values: Array<string | number>): number {
  return values.reduce<number>((sum, value) => sum + Number(value), 0);
}
