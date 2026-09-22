import { requireManageLunchPeriods } from "@/lib/auth";
import {
  getDailyLunchSubsidy,
} from "@/lib/financial-summaries";
import {
  getLatestLunchPeriod,
  getNextPeriodStartDate,
  listLunchPeriods,
} from "@/lib/lunch-periods";
import { canExportLunchPeriodSummaries, canUpdateDailyLunchSubsidy } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { DailyLunchSubsidySetting } from "@/components/daily-lunch-subsidy-control";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { LunchPeriodInfoCallout } from "@/components/admin/lunch-periods/lunch-period-info-callout";
import { CurrentLunchPeriodSummary } from "@/components/admin/lunch-periods/current-lunch-period-summary";
import { AppendLunchPeriodCard } from "@/components/admin/lunch-periods/append-lunch-period-card";
import { LunchPeriodsTable } from "@/components/admin/lunch-periods/lunch-periods-table";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    current?: string;
    "subsidy-updated"?: string;
    "subsidy-error"?: string;
  }>;
};

export default async function LunchPeriodsPage({ searchParams }: Props) {
  const profile = await requireManageLunchPeriods();
  const params = await searchParams;
  const supabase = await createClient();
  const [periods, dailyLunchSubsidy] = await Promise.all([
    listLunchPeriods(supabase),
    getDailyLunchSubsidy(supabase),
  ]);
  const currentPeriod = periods.find((period) => period.is_current) ?? null;
  const latestPeriod = getLatestLunchPeriod(periods);
  const nextStartDate = latestPeriod
    ? getNextPeriodStartDate(latestPeriod.end_date)
    : null;
  const isFirstPeriod = periods.length === 0;

  return (
    <>
      <PageHeader
        title="Lunch Periods"
        description="Configure contiguous payroll-aligned lunch periods. Membership uses order date, not delivery date."
      />

      <LunchPeriodInfoCallout />

      {params.created ? (
        <Alert variant="success" className="mb-6">
          Lunch period created successfully.
        </Alert>
      ) : null}

      {params.updated ? (
        <Alert variant="success" className="mb-6">
          Lunch period updated successfully.
        </Alert>
      ) : null}

      {params.current ? (
        <Alert variant="success" className="mb-6">
          Current lunch period updated successfully.
        </Alert>
      ) : null}

      {params.error === "invalid-range" ? (
        <Alert variant="error" className="mb-6">
          Enter a valid label and date range. Periods must remain contiguous with no gaps or
          overlaps.
        </Alert>
      ) : null}

      {params.error && params.error !== "invalid-range" ? (
        <Alert variant="error" className="mb-6">
          Unable to complete that lunch period action.
        </Alert>
      ) : null}

      <div className="mb-6 space-y-4">
        <CurrentLunchPeriodSummary
          period={currentPeriod}
          canExport={canExportLunchPeriodSummaries(profile.role) && currentPeriod !== null}
        />
        <DailyLunchSubsidySetting
          dailyLunchSubsidy={dailyLunchSubsidy}
          canEdit={canUpdateDailyLunchSubsidy(profile.role)}
          returnTo="/admin/lunch-periods"
          showUpdated={Boolean(params["subsidy-updated"])}
          showError={Boolean(params["subsidy-error"])}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AppendLunchPeriodCard isFirstPeriod={isFirstPeriod} nextStartDate={nextStartDate} />
        <LunchPeriodsTable periods={periods} />
      </div>
    </>
  );
}
