import type { LunchPeriodFinancialSummary } from "@/lib/financial-summaries";

export const ADMIN_FINANCIAL_REPORTS_PAGE = {
  title: "Financial Reports",
  description:
    "Payroll lunch totals by period. Membership uses order date, not delivery date.",
} as const;

export const FINANCIAL_PERIOD_SELECTOR = {
  title: "Select lunch period",
  description: "Choose a lunch period to view financial details.",
} as const;

export const FINANCIAL_PERIOD_GRAND_METRIC_LABELS = {
  totalLunchCost: "Total Lunch Cost",
  companySubsidy: "Company Subsidy",
  salaryDeductions: "Salary Deductions",
  employeesWithOrders: "Employees with Orders",
} as const;

export const FINANCIAL_EMPLOYEE_TABLE_LABELS = {
  employee: "Employee",
  email: "Email",
  orders: "Orders",
  orderDays: "Order days",
  lunchCost: "Lunch Cost",
  companySubsidy: "Company Subsidy",
  salaryDeduction: "Salary Deduction",
} as const;

export const FINANCIAL_EMPLOYEE_TOTALS_SECTION = {
  title: "Employee totals",
  description: "One row per employee for payroll review.",
} as const;

export const FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX =
  "Daily subsidy used for calculations:" as const;

export type FinancialGrandMetricKey = keyof typeof FINANCIAL_PERIOD_GRAND_METRIC_LABELS;

export type FinancialGrandMetric = {
  key: FinancialGrandMetricKey;
  label: string;
  rawValue: string | number;
};

export function buildFinancialGrandMetrics(
  summary: Pick<
    LunchPeriodFinancialSummary,
    "grand_gross" | "grand_subsidy_used" | "grand_net_deduction" | "employees"
  >,
): FinancialGrandMetric[] {
  return [
    {
      key: "totalLunchCost",
      label: FINANCIAL_PERIOD_GRAND_METRIC_LABELS.totalLunchCost,
      rawValue: summary.grand_gross,
    },
    {
      key: "companySubsidy",
      label: FINANCIAL_PERIOD_GRAND_METRIC_LABELS.companySubsidy,
      rawValue: summary.grand_subsidy_used,
    },
    {
      key: "salaryDeductions",
      label: FINANCIAL_PERIOD_GRAND_METRIC_LABELS.salaryDeductions,
      rawValue: summary.grand_net_deduction,
    },
    {
      key: "employeesWithOrders",
      label: FINANCIAL_PERIOD_GRAND_METRIC_LABELS.employeesWithOrders,
      rawValue: summary.employees.length,
    },
  ];
}

export function getEffectivePeriodSubsidyAmount(
  summary: Pick<LunchPeriodFinancialSummary, "daily_lunch_subsidy">,
): string | number {
  return summary.daily_lunch_subsidy;
}
