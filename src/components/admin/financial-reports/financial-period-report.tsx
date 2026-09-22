import Link from "next/link";
import type { LunchPeriodFinancialSummary } from "@/lib/financial-summaries";
import {
  buildFinancialGrandMetrics,
  FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX,
  getEffectivePeriodSubsidyAmount,
} from "@/lib/admin-financial-reports";
import { formatFinalizationBlockedMessage } from "@/lib/delivery-reconciliation";
import { formatLunchPeriodCompactAdminRange } from "@/lib/lunch-periods";
import { formatCurrency } from "@/lib/format";
import { finalizeLunchPeriod } from "@/app/admin/financials/actions";
import { IconChart, IconDownload, IconInfo } from "@/components/icons/line-icons";
import { LunchPeriodStatusBadge } from "@/components/admin/lunch-periods/lunch-period-status-badge";
import { FinancialMetricGrid } from "@/components/admin/financial-reports/financial-metric-grid";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  summary: LunchPeriodFinancialSummary;
  selectedPeriodId: string;
  returnTo: string;
  canExport: boolean;
  canFinalize: boolean;
  unresolvedIssueCount: number;
};

export function FinancialPeriodReport({
  summary,
  selectedPeriodId,
  returnTo,
  canExport,
  canFinalize,
  unresolvedIssueCount,
}: Props) {
  const metrics = buildFinancialGrandMetrics(summary);
  const effectiveSubsidy = getEffectivePeriodSubsidyAmount(summary);
  const showFinalize =
    canFinalize && summary.period.status === "open" && unresolvedIssueCount === 0;
  const showReconciliationWarning =
    unresolvedIssueCount > 0 && summary.period.status === "open";

  return (
    <article className="mb-6 overflow-hidden rounded-xl border border-border border-t-4 border-t-primary/50 bg-surface shadow-sm">
      <header className="report-header border-b border-primary/20 bg-gradient-to-r from-primary/[0.07] via-primary/[0.04] to-slate-50/90 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between min-[520px]:gap-8">
          <div className="report-header-main flex min-w-0 flex-1 items-start gap-4">
            <div
              className="report-icon-well flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary max-[519px]:hidden"
              aria-hidden
            >
              <IconChart size={24} />
            </div>
            <div className="report-identity min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  {summary.period.label}
                </h2>
                {summary.period.is_current ? (
                  <LunchPeriodStatusBadge status="active" />
                ) : null}
                <StatusBadge
                  status={summary.period.status === "finalized" ? "closed" : "open"}
                />
              </div>
              <p className="mt-2 text-base text-slate-600">
                {formatLunchPeriodCompactAdminRange(
                  summary.period.start_date,
                  summary.period.end_date,
                )}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <IconInfo size={16} className="shrink-0 text-primary" aria-hidden />
                <span>
                  {FINANCIAL_PERIOD_SUBSIDY_DISPLAY_PREFIX}{" "}
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(effectiveSubsidy)}
                  </span>
                </span>
              </p>
            </div>
          </div>

          <div className="report-actions flex shrink-0 flex-col gap-2 min-[520px]:items-end">
            {canExport ? (
              <Link
                href={`/admin/financials/export?periodId=${selectedPeriodId}`}
                className={`${linkButtonClass("primary")} w-full justify-center gap-2 min-[520px]:w-auto`}
              >
                <IconDownload size={16} aria-hidden />
                Export to Excel
              </Link>
            ) : null}
            {showFinalize ? (
              <form action={finalizeLunchPeriod} className="min-[520px]:text-right">
                <input type="hidden" name="periodId" value={selectedPeriodId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button type="submit" variant="secondary" className="w-full min-[520px]:w-auto">
                  Finalize period
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      <div className="px-5 py-4 sm:px-6">
        {showReconciliationWarning ? (
          <Alert
            variant="warning"
            className="mt-0 flex items-start gap-2.5 py-2.5 text-sm font-normal leading-6"
          >
            <IconInfo size={18} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
            <span>
              {formatFinalizationBlockedMessage(unresolvedIssueCount)} HR must complete delivery
              reconciliation before finalization.
            </span>
          </Alert>
        ) : null}

        <FinancialMetricGrid
          metrics={metrics}
          className={showReconciliationWarning ? "mt-4" : "mt-0"}
        />
      </div>
    </article>
  );
}
