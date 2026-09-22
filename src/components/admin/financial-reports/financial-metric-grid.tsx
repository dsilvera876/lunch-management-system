import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import type { FinancialGrandMetric } from "@/lib/admin-financial-reports";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";
import {
  IconChart,
  IconReceipt,
  IconUsers,
  IconWallet,
} from "@/components/icons/line-icons";

const METRIC_ICONS: Record<FinancialGrandMetric["key"], ReactNode> = {
  totalLunchCost: <IconReceipt aria-hidden />,
  companySubsidy: <IconWallet aria-hidden />,
  salaryDeductions: <IconChart aria-hidden />,
  employeesWithOrders: <IconUsers aria-hidden />,
};

type Props = {
  metrics: FinancialGrandMetric[];
  className?: string;
};

function formatMetricValue(metric: FinancialGrandMetric): string {
  if (metric.key === "employeesWithOrders") {
    return String(metric.rawValue);
  }

  return formatCurrency(metric.rawValue);
}

export function FinancialMetricGrid({ metrics, className = "mt-4" }: Props) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {metrics.map((metric) => (
        <Card key={metric.key} padding="sm" className="h-full shadow-sm">
          <div className="flex h-full items-center gap-3">
            <TealIconWell size="md" className="shrink-0">
              {METRIC_ICONS[metric.key]}
            </TealIconWell>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {metric.label}
              </p>
              <p className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {formatMetricValue(metric)}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
