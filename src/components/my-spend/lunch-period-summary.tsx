import type { ReactNode } from "react";
import { formatLunchPeriodRange } from "@/lib/lunch-periods";
import { formatCurrency } from "@/lib/format";
import type { StaffPeriodSpendSummary } from "@/lib/staff-my-spend";
import {
  IconCalendar,
  IconClipboard,
  IconWallet,
} from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";

type Props = {
  title: string;
  period: StaffPeriodSpendSummary | null;
  emptyMessage: string;
};

function PeriodStatusBadge({ status }: { status: StaffPeriodSpendSummary["status"] }) {
  if (status === "finalized") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
        Closed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
      OPEN
    </span>
  );
}

function PeriodMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div
      role="listitem"
      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 sm:gap-3 sm:px-4"
    >
      <TealIconWell size="sm" className="shrink-0">
        {icon}
      </TealIconWell>
      <div className="min-w-0">
        <p className="text-xs text-staff-instruction">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-slate-900 sm:text-xl">{value}</p>
      </div>
    </div>
  );
}

export function LunchPeriodSummary({ title, period, emptyMessage }: Props) {
  return (
    <Card padding="md" className="flex h-full min-w-0 flex-1 flex-col shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {period ? <PeriodStatusBadge status={period.status} /> : null}
      </div>

      {period ? (
        <>
          <div className="mt-2 space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm text-staff-instruction">
              <IconCalendar size={15} className="shrink-0 text-staff-teal" aria-hidden />
              {formatLunchPeriodRange(period.start_date, period.end_date)}
            </p>
            <p className="text-xs text-staff-instruction">
              Daily subsidy: {formatCurrency(Number(period.daily_subsidy_rate))}
            </p>
          </div>

          <div
            className="mt-5 grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            role="list"
            aria-label={`${title} metrics`}
          >
            <PeriodMetric
              label="Salary Deduction"
              value={formatCurrency(period.net_deduction)}
              icon={<IconWallet size={15} />}
            />
            <PeriodMetric
              label="Lunch Days"
              value={period.qualifying_order_days}
              icon={<IconCalendar size={15} />}
            />
            <PeriodMetric
              label="Orders Placed"
              value={period.order_count}
              icon={<IconClipboard size={15} />}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-staff-instruction">{emptyMessage}</p>
      )}
    </Card>
  );
}
