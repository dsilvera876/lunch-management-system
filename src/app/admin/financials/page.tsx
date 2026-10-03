import { requireAccountsOperationalRead } from "@/lib/auth";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { isSupportReadOnlyActor } from "@/lib/support-mode";
import {
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
  canMutateAccountsOperationalData,
} from "@/lib/roles";
import { loadStaffPeriodFinalizedNoticeSummary } from "@/lib/staff-period-notice-server";
import { FinancialStaffPeriodNoticeSection } from "@/components/admin/financial-reports/financial-staff-period-notice";
import {
  getLunchPeriodFinancialSummary,
} from "@/lib/financial-summaries";
import { ADMIN_FINANCIAL_REPORTS_PAGE } from "@/lib/admin-financial-reports";
import { listLunchPeriods } from "@/lib/lunch-periods";
import { createClient } from "@/lib/supabase/server";
import { FinancialPeriodSelector } from "@/components/admin/financial-reports/financial-period-selector";
import { FinancialPeriodReport } from "@/components/admin/financial-reports/financial-period-report";
import { FinancialEmployeeTotals } from "@/components/admin/financial-reports/financial-employee-totals";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  searchParams: Promise<{
    periodId?: string;
    finalized?: string;
    promptStaffNotice?: string;
    noticeError?: string;
    noticeQueued?: string;
    error?: string;
  }>;
};

export default async function AdminFinancialsPage({ searchParams }: Props) {
  const profile = await requireAccountsOperationalRead();
  const supportSession = await fetchActiveSupportSession();
  const supportReadOnly = isSupportReadOnlyActor(profile.role, supportSession);
  const params = await searchParams;
  const supabase = await createClient();
  const periods = await listLunchPeriods(supabase);
  const currentPeriod = periods.find((period) => period.is_current) ?? null;
  const selectedPeriodId = params.periodId ?? currentPeriod?.id ?? periods[0]?.id ?? null;
  const summary = selectedPeriodId
    ? await getLunchPeriodFinancialSummary(supabase, selectedPeriodId)
    : null;
  const unresolvedIssueCount =
    selectedPeriodId && summary?.period.status === "open"
      ? Number(
          (
            await supabase.rpc("get_lunch_period_unresolved_delivery_issue_count", {
              p_period_id: selectedPeriodId,
            })
          ).data ?? 0,
        )
      : 0;
  const returnTo = selectedPeriodId
    ? `/admin/financials?periodId=${selectedPeriodId}`
    : "/admin/financials";
  const staffNoticeSummary =
    selectedPeriodId && summary?.period.status === "finalized"
      ? await loadStaffPeriodFinalizedNoticeSummary(supabase, selectedPeriodId)
      : null;
  const canMutateAccounts = canMutateAccountsOperationalData(profile.role);

  return (
    <>
      <PageHeader
        title={ADMIN_FINANCIAL_REPORTS_PAGE.title}
        description={ADMIN_FINANCIAL_REPORTS_PAGE.description}
      />

      {params.finalized ? (
        <Alert variant="success" className="mb-6">
          Lunch period finalized successfully.
        </Alert>
      ) : null}

      {params.error ? (
        <Alert variant="error" className="mb-6">
          Unable to complete that financial action.
        </Alert>
      ) : null}

      <FinancialPeriodSelector periods={periods} selectedPeriodId={selectedPeriodId} />

      {!summary ? (
        <EmptyState
          title="No period selected"
          description={
            currentPeriod
              ? "Select a lunch period to review payroll totals."
              : "No current lunch period is set, but historical periods may still be reviewed."
          }
        />
      ) : (
        <div className="space-y-6">
          <FinancialPeriodReport
            summary={summary}
            selectedPeriodId={selectedPeriodId!}
            returnTo={returnTo}
            canExport={!supportReadOnly && canExportFinancialSummaries(profile.role)}
            canFinalize={!supportReadOnly && canFinalizeLunchPeriods(profile.role)}
            unresolvedIssueCount={unresolvedIssueCount}
            supportReadOnly={supportReadOnly}
          />
          {staffNoticeSummary ? (
            <FinancialStaffPeriodNoticeSection
              periodId={selectedPeriodId!}
              periodLabel={summary.period.label}
              summary={staffNoticeSummary}
              canMutate={canMutateAccounts}
              supportReadOnly={supportReadOnly}
              showPostFinalizePrompt={params.promptStaffNotice === "1"}
              noticeError={params.noticeError ?? null}
              noticeQueued={params.noticeQueued === "1"}
            />
          ) : null}
          <FinancialEmployeeTotals employees={summary.employees} />
        </div>
      )}
    </>
  );
}
