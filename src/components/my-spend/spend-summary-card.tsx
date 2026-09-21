import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import { formatLunchDayCount } from "@/lib/staff-my-spend";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";

const SALARY_DEDUCTION_HINT =
  "Amount deducted from salary after lunch subsidy.";

type Props = {
  label: string;
  payrollDeduction: number;
  lunchDayCount: number;
  icon: ReactNode;
};

export function SpendSummaryCard({
  label,
  payrollDeduction,
  lunchDayCount,
  icon,
}: Props) {
  return (
    <Card padding="sm" className="h-full shadow-sm">
      <div className="flex h-full items-center gap-3">
        <TealIconWell className="shrink-0">{icon}</TealIconWell>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p
            className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]"
            title={SALARY_DEDUCTION_HINT}
            aria-label={`${label}: ${formatCurrency(payrollDeduction)}. ${SALARY_DEDUCTION_HINT}`}
          >
            {formatCurrency(payrollDeduction)}
          </p>
          <p className="mt-0.5 text-sm text-muted">{formatLunchDayCount(lunchDayCount)}</p>
        </div>
      </div>
    </Card>
  );
}
