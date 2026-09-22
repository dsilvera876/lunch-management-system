import Link from "next/link";
import {
  countLunchPeriodDays,
  formatLunchPeriodAdminDate,
  formatLunchPeriodCompactAdminRange,
  type LunchPeriod,
} from "@/lib/lunch-periods";
import { IconCalendar, IconDownload } from "@/components/icons/line-icons";
import { LunchPeriodStatusBadge } from "@/components/admin/lunch-periods/lunch-period-status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  period: LunchPeriod | null;
  canExport: boolean;
};

function PeriodMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-3 sm:px-4 lg:items-center lg:text-center">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900 lg:text-lg">{value}</dd>
    </div>
  );
}

const DESKTOP_GRID_WITH_EXPORT =
  "lg:grid-cols-[minmax(20rem,1.6fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(13rem,1.1fr)]";

const DESKTOP_GRID_NO_EXPORT =
  "lg:grid-cols-[minmax(20rem,1.6fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)]";

export function CurrentLunchPeriodSummary({ period, canExport }: Props) {
  if (!period) {
    return (
      <Card className="mb-6 border-t-4 border-t-primary/40">
        <EmptyState
          title="No current lunch period"
          description="Create a period below and mark it as current when ready."
        />
      </Card>
    );
  }

  const calendarDays = countLunchPeriodDays(period.start_date, period.end_date);

  return (
    <Card className="mb-6 overflow-hidden border-t-4 border-t-primary/50 shadow-sm">
      <div
        className={`flex flex-col gap-5 md:gap-6 lg:grid lg:items-center lg:divide-x lg:divide-border/80 lg:gap-0 ${
          canExport ? DESKTOP_GRID_WITH_EXPORT : DESKTOP_GRID_NO_EXPORT
        }`}
      >
        <div className="flex min-w-0 gap-3 lg:py-1 lg:pr-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconCalendar size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-muted">Current lunch period</p>
              <LunchPeriodStatusBadge status="active" />
            </div>
            <p className="mt-1 text-lg font-semibold leading-snug tracking-tight text-slate-900 lg:text-xl lg:whitespace-nowrap">
              {formatLunchPeriodCompactAdminRange(period.start_date, period.end_date)}
            </p>
            <p className="mt-0.5 text-sm text-muted">{period.label}</p>
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-border/80 lg:contents">
          <PeriodMetric
            label="Start date"
            value={formatLunchPeriodAdminDate(period.start_date)}
          />
          <PeriodMetric
            label="End date"
            value={formatLunchPeriodAdminDate(period.end_date)}
          />
          <PeriodMetric label="Calendar days" value={calendarDays} />
        </dl>

        {canExport ? (
          <div className="flex min-w-0 flex-col justify-center gap-2 px-3 sm:px-4 lg:px-5 lg:py-1">
            <Link
              href={`/admin/financials/export?periodId=${period.id}`}
              className={`${linkButtonClass("secondary")} w-full justify-center gap-2 border-primary/30 text-primary hover:bg-primary/5 sm:w-auto lg:w-full`}
            >
              <IconDownload size={16} aria-hidden />
              Export to Excel
            </Link>
            <p className="text-center text-xs leading-5 text-muted lg:mx-auto lg:max-w-[12rem]">
              Export all staff summaries for the current lunch period.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
