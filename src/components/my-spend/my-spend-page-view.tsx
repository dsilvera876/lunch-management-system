"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StaffFinancialDashboard } from "@/lib/financial-summaries";
import {
  buildLunchDaySpendRows,
  getLastLunchPeriodCardSummary,
  normalizePeriodForLunchDays,
  periodSummaryFromDashboard,
  scopeFromAmountSummary,
  selectPeriodForLunchDays,
} from "@/lib/staff-my-spend";
import {
  IconCalendar,
  IconChart,
  IconDownload,
  IconHistory,
} from "@/components/icons/line-icons";
import { SpendSummaryCard } from "@/components/my-spend/spend-summary-card";
import { LunchPeriodSummary } from "@/components/my-spend/lunch-period-summary";
import { LunchDaysTable } from "@/components/my-spend/lunch-days-table";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  dashboard: StaffFinancialDashboard;
  canExport: boolean;
};

type LunchDaysPeriodKey = "current" | "previous";

const exportLinkClass = `${linkButtonClass("secondary")} gap-1.5 border-primary/25 bg-surface text-primary hover:bg-primary/5`;

export function MySpendPageView({ dashboard, canExport }: Props) {
  const [lunchDaysPeriod, setLunchDaysPeriod] = useState<LunchDaysPeriodKey>("current");

  const today = scopeFromAmountSummary(dashboard.today);
  const thisWeek = scopeFromAmountSummary(dashboard.current_week);
  const thisMonth = scopeFromAmountSummary(dashboard.current_month);
  const lastPeriod = getLastLunchPeriodCardSummary(dashboard);

  const currentPeriodSummary = periodSummaryFromDashboard(dashboard.current_period);
  const previousPeriodSummary = periodSummaryFromDashboard(
    normalizePeriodForLunchDays(dashboard.previous_period),
  );

  const lunchDaysPeriodData = useMemo(
    () => selectPeriodForLunchDays(dashboard, lunchDaysPeriod),
    [dashboard, lunchDaysPeriod],
  );

  const lunchDayRows = useMemo(() => {
    if (!lunchDaysPeriodData) {
      return [];
    }

    return buildLunchDaySpendRows(
      lunchDaysPeriodData.daily_summary,
      lunchDaysPeriodData.orders,
    );
  }, [lunchDaysPeriodData]);

  const showPreviousPeriodSelector = Boolean(dashboard.previous_period);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SpendSummaryCard
          label="Today"
          icon={<IconCalendar size={18} />}
          payrollDeduction={today.netDeduction}
          lunchDayCount={today.qualifyingOrderDays}
        />
        <SpendSummaryCard
          label="This Week"
          icon={<IconChart size={18} />}
          payrollDeduction={thisWeek.netDeduction}
          lunchDayCount={thisWeek.qualifyingOrderDays}
        />
        <SpendSummaryCard
          label="This Month"
          icon={<IconCalendar size={18} />}
          payrollDeduction={thisMonth.netDeduction}
          lunchDayCount={thisMonth.qualifyingOrderDays}
        />
        <SpendSummaryCard
          label="Last Lunch Period"
          icon={<IconHistory size={18} />}
          payrollDeduction={lastPeriod?.netDeduction ?? 0}
          lunchDayCount={lastPeriod?.qualifyingOrderDays ?? 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LunchPeriodSummary
          title="Current Lunch Period"
          period={currentPeriodSummary}
          emptyMessage="No current lunch period has been configured yet."
        />
        <LunchPeriodSummary
          title="Previous Lunch Period"
          period={previousPeriodSummary}
          emptyMessage="No previous lunch period is available yet."
        />
      </div>

      <Card padding="md" className="shadow-sm">
        <SectionHeader
          title="Lunch Days"
          description="Your recent lunch days and how much came out of your salary."
          actions={
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {showPreviousPeriodSelector ? (
                <label className="relative block min-w-[11.5rem]">
                  <span className="sr-only">Lunch period</span>
                  <span className="pointer-events-none absolute left-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <IconHistory size={14} aria-hidden />
                  </span>
                  <select
                    value={lunchDaysPeriod}
                    onChange={(event) =>
                      setLunchDaysPeriod(event.target.value as LunchDaysPeriodKey)
                    }
                    className="min-h-10 w-full appearance-none rounded-xl border border-border bg-surface py-2 pl-11 pr-9 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                  >
                    <option value="current">Current period</option>
                    <option value="previous">Previous period</option>
                  </select>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
                    aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </label>
              ) : null}
              {canExport ? (
                <Link href="/financials/export" className={exportLinkClass}>
                  <IconDownload size={16} aria-hidden />
                  Export My Summary
                </Link>
              ) : null}
            </div>
          }
        />

        <LunchDaysTable
          rows={lunchDayRows}
          emptyMessage="No qualifying lunch orders in this period."
        />
      </Card>
    </div>
  );
}
