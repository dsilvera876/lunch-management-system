import { requireLunchPeriodsRead } from "@/lib/auth";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { isSupportReadOnlyActor } from "@/lib/support-mode";
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
import { LunchPeriodInfoCallout } from "@/components/admin/lunch-periods/lunch-period-info-callout";
import { CurrentLunchPeriodSummary } from "@/components/admin/lunch-periods/current-lunch-period-summary";
import { AppendLunchPeriodCard } from "@/components/admin/lunch-periods/append-lunch-period-card";
import { LunchPeriodsTable } from "@/components/admin/lunch-periods/lunch-periods-table";
import { LunchPeriodsWorkspace } from "@/components/admin/lunch-periods/lunch-periods-workspace";
import { pageMetadata } from "@/lib/page-titles";

export const metadata = pageMetadata("adminLunchPeriods");

type Props = {
  searchParams: Promise<{
    "subsidy-updated"?: string;
    "subsidy-error"?: string;
  }>;
};

export default async function LunchPeriodsPage({ searchParams }: Props) {
  const profile = await requireLunchPeriodsRead();
  const supportSession = await fetchActiveSupportSession();
  const supportReadOnly = isSupportReadOnlyActor(
    profile.role,
    supportSession,
  );
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
    <LunchPeriodsWorkspace>
      <PageHeader
        title="Lunch Periods"
        description="Configure contiguous payroll-aligned lunch periods. Membership uses order date, not delivery date."
      />

      <LunchPeriodInfoCallout />

      <div className="mb-6 space-y-4">
        <CurrentLunchPeriodSummary
          period={currentPeriod}
          canExport={
            !supportReadOnly &&
            canExportLunchPeriodSummaries(profile.role) &&
            currentPeriod !== null
          }
        />
        <DailyLunchSubsidySetting
          dailyLunchSubsidy={dailyLunchSubsidy}
          canEdit={!supportReadOnly && canUpdateDailyLunchSubsidy(profile.role)}
          returnTo="/admin/lunch-periods"
          showUpdated={Boolean(params["subsidy-updated"])}
          showError={Boolean(params["subsidy-error"])}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {supportReadOnly ? null : (
          <AppendLunchPeriodCard isFirstPeriod={isFirstPeriod} nextStartDate={nextStartDate} />
        )}
        <LunchPeriodsTable periods={periods} readOnly={supportReadOnly} />
      </div>
    </LunchPeriodsWorkspace>
  );
}
