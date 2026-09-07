import type { SupabaseClient } from "@supabase/supabase-js";

export type LunchPeriodStatus = "open" | "finalized";

export type FinancialOrderLine = {
  order_id: string;
  order_date: string;
  delivery_date: string;
  provider_name: string | null;
  order_status: string;
  order_total: string | number;
};

export type FinancialMonthSummary = {
  year: number;
  month: number;
  label: string;
  start_date: string;
  end_date: string;
  total: string | number;
};

export type StaffCurrentPeriodSummary = {
  period_id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: LunchPeriodStatus;
  order_count: number;
  period_total: string | number;
  orders: FinancialOrderLine[];
};

export type StaffFinancialDashboard = {
  today_total: string | number;
  current_month_total: string | number;
  recent_months: FinancialMonthSummary[];
  current_period: StaffCurrentPeriodSummary | null;
};

export type ManagementEmployeeSummary = {
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
  order_count: number;
  period_total: string | number;
};

export type ManagementOrderLine = FinancialOrderLine & {
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
};

export type LunchPeriodFinancialSummary = {
  period: {
    period_id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: LunchPeriodStatus;
    is_current: boolean;
  };
  employees: ManagementEmployeeSummary[];
  orders: ManagementOrderLine[];
  grand_total: string | number;
};

export type StaffExportPayload = {
  period: {
    period_id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: LunchPeriodStatus;
  };
  employee: {
    employee_id: string;
    employee_name: string | null;
    employee_email: string | null;
  };
  order_count: number;
  period_total: string | number;
  orders: FinancialOrderLine[];
};

export async function getStaffFinancialDashboard(
  supabase: SupabaseClient,
): Promise<StaffFinancialDashboard> {
  const { data, error } = await supabase.rpc("get_my_financial_dashboard");

  if (error) {
    throw new Error("Unable to load financial summaries.");
  }

  return data as StaffFinancialDashboard;
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
