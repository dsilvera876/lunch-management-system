import Link from "next/link";
import { requireViewAllFinancialSummaries } from "@/lib/auth";
import {
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
} from "@/lib/roles";
import {
  getLunchPeriodFinancialSummary,
} from "@/lib/financial-summaries";
import { formatLunchPeriodRange, listLunchPeriods } from "@/lib/lunch-periods";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { finalizeLunchPeriod } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    periodId?: string;
    finalized?: string;
    error?: string;
  }>;
};

export default async function AdminFinancialsPage({ searchParams }: Props) {
  const profile = await requireViewAllFinancialSummaries();
  const params = await searchParams;
  const supabase = await createClient();
  const periods = await listLunchPeriods(supabase);
  const currentPeriod = periods.find((period) => period.is_current) ?? null;
  const selectedPeriodId = params.periodId ?? currentPeriod?.id ?? periods[0]?.id ?? null;
  const summary = selectedPeriodId
    ? await getLunchPeriodFinancialSummary(supabase, selectedPeriodId)
    : null;

  return (
    <>
      <PageHeader
        title="Financial Summaries"
        description="Payroll lunch totals by period. Membership uses order date."
      />

      {params.finalized && (
        <Alert variant="success" className="mb-6">
          Lunch period finalized successfully.
        </Alert>
      )}

      {params.error && (
        <Alert variant="error" className="mb-6">
          Unable to complete that financial action.
        </Alert>
      )}

      <Card className="mb-8">
        <SectionHeader
          title="Select lunch period"
          description="Review historical or current payroll periods."
        />

        {periods.length === 0 ? (
          <EmptyState
            title="No lunch periods configured"
            description="Create lunch periods before reviewing financial summaries."
            action={
              <Link href="/admin/lunch-periods" className={linkButtonClass("primary")}>
                Manage lunch periods
              </Link>
            }
          />
        ) : (
          <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="periodId" className="mb-2 block text-sm font-medium">
                Lunch period
              </label>
              <select
                id="periodId"
                name="periodId"
                defaultValue={selectedPeriodId ?? undefined}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
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
            <Button type="submit" variant="secondary">
              View summary
            </Button>
          </form>
        )}
      </Card>

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
        <div className="space-y-8">
          <Card>
            <SectionHeader
              title={summary.period.label}
              description={formatLunchPeriodRange(
                summary.period.start_date,
                summary.period.end_date,
              )}
              actions={
                <div className="flex flex-wrap gap-2">
                  {canExportFinancialSummaries(profile.role) && selectedPeriodId && (
                    <Link
                      href={`/admin/financials/export?periodId=${selectedPeriodId}`}
                      className={linkButtonClass("primary")}
                    >
                      Export to Excel
                    </Link>
                  )}
                  {canFinalizeLunchPeriods(profile.role) &&
                    summary.period.status === "open" &&
                    selectedPeriodId && (
                      <form action={finalizeLunchPeriod}>
                        <input type="hidden" name="periodId" value={selectedPeriodId} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/admin/financials?periodId=${selectedPeriodId}`}
                        />
                        <Button type="submit" variant="secondary">
                          Finalize period
                        </Button>
                      </form>
                    )}
                </div>
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              {summary.period.is_current && <StatusBadge status="active" />}
              <StatusBadge
                status={summary.period.status === "finalized" ? "closed" : "open"}
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted">Overall period total</p>
                <p className="text-2xl font-semibold">
                  {formatMoney(summary.grand_total)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Employees with orders</p>
                <p className="text-2xl font-semibold">{summary.employees.length}</p>
              </div>
            </div>
          </Card>

          {summary.employees.length === 0 ? (
            <EmptyState
              title="No qualifying orders in this period"
              description="Submitted and fulfilled orders with order dates in this period will appear here."
            />
          ) : (
            <Card>
              <SectionHeader
                title="Employee totals"
                description="One row per employee for payroll review."
              />
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium text-right">Orders</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.employees.map((employee) => (
                      <tr
                        key={employee.employee_id}
                        className="border-b border-border/70"
                      >
                        <td className="px-3 py-2">
                          {employee.employee_name ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {employee.employee_email ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {employee.order_count}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatMoney(employee.period_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
