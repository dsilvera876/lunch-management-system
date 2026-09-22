import Link from "next/link";
import type { LunchPeriod } from "@/lib/lunch-periods";
import { formatLunchPeriodRange } from "@/lib/lunch-periods";
import { FINANCIAL_PERIOD_SELECTOR } from "@/lib/admin-financial-reports";
import { IconCalendar } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  periods: LunchPeriod[];
  selectedPeriodId: string | null;
};

export function FinancialPeriodSelector({ periods, selectedPeriodId }: Props) {
  if (periods.length === 0) {
    return (
      <Card padding="sm" className="mb-6 shadow-sm">
        <EmptyState
          title="No lunch periods configured"
          description="Create lunch periods before reviewing financial reports."
          action={
            <Link href="/admin/lunch-periods" className={linkButtonClass("primary")}>
              Manage lunch periods
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card padding="sm" className="mb-6 py-3.5 shadow-sm sm:py-4">
      <form
        method="get"
        className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(20rem,1fr)_auto] lg:items-end lg:gap-x-4 lg:gap-y-0"
      >
        <div className="flex shrink-0 items-start gap-2.5">
          <TealIconWell size="sm" className="mt-0.5 shrink-0">
            <IconCalendar aria-hidden />
          </TealIconWell>
          <div className="min-w-0 leading-snug">
            <p className="text-sm font-semibold text-slate-900">{FINANCIAL_PERIOD_SELECTOR.title}</p>
            <p className="text-sm text-muted">{FINANCIAL_PERIOD_SELECTOR.description}</p>
          </div>
        </div>

        <div className="min-w-0 w-full lg:max-w-3xl">
          <label htmlFor="periodId" className="mb-1 block text-xs font-medium text-muted">
            Lunch period
          </label>
          <select
            id="periodId"
            name="periodId"
            defaultValue={selectedPeriodId ?? undefined}
            className="block w-full min-h-10 rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label} ({formatLunchPeriodRange(period.start_date, period.end_date)})
                {period.is_current ? " — current" : ""}
                {period.status === "finalized" ? " — finalized" : ""}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="secondary" className="w-full shrink-0 lg:w-auto lg:self-end">
          View summary
        </Button>
      </form>
    </Card>
  );
}
