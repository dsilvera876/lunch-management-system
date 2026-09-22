import type { ManagementEmployeeSummary } from "@/lib/financial-summaries";
import {
  FINANCIAL_EMPLOYEE_TABLE_LABELS,
  FINANCIAL_EMPLOYEE_TOTALS_SECTION,
} from "@/lib/admin-financial-reports";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  employees: ManagementEmployeeSummary[];
};

export function FinancialEmployeeTotals({ employees }: Props) {
  if (employees.length === 0) {
    return (
      <EmptyState
        title="No qualifying orders in this period"
        description="Submitted and fulfilled orders with order dates in this period will appear here."
      />
    );
  }

  return (
    <Card className="shadow-sm">
      <SectionHeader
        title={FINANCIAL_EMPLOYEE_TOTALS_SECTION.title}
        description={FINANCIAL_EMPLOYEE_TOTALS_SECTION.description}
      />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-3 py-2 font-medium">{FINANCIAL_EMPLOYEE_TABLE_LABELS.employee}</th>
              <th className="px-3 py-2 font-medium">{FINANCIAL_EMPLOYEE_TABLE_LABELS.email}</th>
              <th className="px-3 py-2 font-medium text-right">
                {FINANCIAL_EMPLOYEE_TABLE_LABELS.orders}
              </th>
              <th className="px-3 py-2 font-medium text-right">
                {FINANCIAL_EMPLOYEE_TABLE_LABELS.orderDays}
              </th>
              <th className="px-3 py-2 font-medium text-right">
                {FINANCIAL_EMPLOYEE_TABLE_LABELS.lunchCost}
              </th>
              <th className="px-3 py-2 font-medium text-right">
                {FINANCIAL_EMPLOYEE_TABLE_LABELS.companySubsidy}
              </th>
              <th className="px-3 py-2 font-medium text-right">
                {FINANCIAL_EMPLOYEE_TABLE_LABELS.salaryDeduction}
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.employee_id} className="border-b border-border/70">
                <td className="px-3 py-2">{employee.employee_name ?? "—"}</td>
                <td className="px-3 py-2">{employee.employee_email ?? "—"}</td>
                <td className="px-3 py-2 text-right">{employee.order_count}</td>
                <td className="px-3 py-2 text-right">{employee.qualifying_order_days}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(employee.gross)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(employee.subsidy_used)}</td>
                <td className="px-3 py-2 text-right text-base font-semibold text-slate-900">
                  {formatCurrency(employee.net_deduction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
