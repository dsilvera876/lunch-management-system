import {
  createFirstLunchPeriod,
  createNextLunchPeriod,
} from "@/app/admin/lunch-periods/actions";
import { formatLunchPeriodAdminDate } from "@/lib/lunch-periods";
import { IconCalendar, IconPlus } from "@/components/icons/line-icons";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

type Props = {
  isFirstPeriod: boolean;
  nextStartDate: string | null;
};

export function AppendLunchPeriodCard({ isFirstPeriod, nextStartDate }: Props) {
  if (isFirstPeriod) {
    return (
      <Card padding="md" className="h-full shadow-sm">
        <SectionHeader
          title="Create first period"
          description="Choose the start and end dates for the first payroll period."
        />
        <form action={createFirstLunchPeriod} className="space-y-4">
          <FormField label="Label *" htmlFor="label">
            <input
              id="label"
              name="label"
              required
              placeholder="e.g. September 2026"
              className={inputClassName}
            />
          </FormField>
          <FormField label="Start date *" htmlFor="startDate">
            <input id="startDate" name="startDate" type="date" required className={inputClassName} />
          </FormField>
          <FormField label="End date *" htmlFor="endDate">
            <input id="endDate" name="endDate" type="date" required className={inputClassName} />
          </FormField>
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            Create first period
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card padding="md" className="h-full shadow-sm">
      <div className="mb-4 flex gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconPlus size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Append next period</h2>
          <p className="mt-1 text-sm text-muted">
            The next period will start the day after the current period ends.
          </p>
        </div>
      </div>

      {nextStartDate ? (
        <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3">
          <p className="text-xs font-medium text-muted">Next period start date (auto-calculated)</p>
          <p className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-900">
            <IconCalendar size={16} className="text-primary" aria-hidden />
            {formatLunchPeriodAdminDate(nextStartDate)}
          </p>
        </div>
      ) : null}

      <form action={createNextLunchPeriod} className="mt-4 space-y-4">
        <input type="hidden" name="derivedStartDate" value={nextStartDate ?? ""} />
        <FormField label="Label *" htmlFor="next-label">
          <input
            id="next-label"
            name="label"
            required
            placeholder="e.g. October 2026"
            className={inputClassName}
          />
        </FormField>
        <FormField label="End date *" htmlFor="next-endDate">
          <input id="next-endDate" name="endDate" type="date" required className={inputClassName} />
        </FormField>
        {nextStartDate ? (
          <p className="rounded-lg border border-border/80 bg-surface/80 px-3 py-2 text-xs text-muted">
            The next period will run from {formatLunchPeriodAdminDate(nextStartDate)} to your
            selected end date.
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full sm:w-auto">
          Append next period
        </Button>
      </form>
    </Card>
  );
}
