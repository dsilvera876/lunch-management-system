import { requireManageLunchPeriods } from "@/lib/auth";
import {
  formatLunchPeriodRange,
  getLatestLunchPeriod,
  getNextPeriodStartDate,
  isLatestLunchPeriod,
  listLunchPeriods,
} from "@/lib/lunch-periods";
import { canExportLunchPeriodSummaries } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import {
  createFirstLunchPeriod,
  createNextLunchPeriod,
  setCurrentLunchPeriod,
  updateLatestLunchPeriodEndDate,
  updateLunchPeriodLabel,
} from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    current?: string;
  }>;
};

export default async function LunchPeriodsPage({ searchParams }: Props) {
  const profile = await requireManageLunchPeriods();
  const params = await searchParams;
  const supabase = await createClient();
  const periods = await listLunchPeriods(supabase);
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

      {params.created && (
        <Alert variant="success" className="mb-6">
          Lunch period created successfully.
        </Alert>
      )}

      {params.updated && (
        <Alert variant="success" className="mb-6">
          Lunch period updated successfully.
        </Alert>
      )}

      {params.current && (
        <Alert variant="success" className="mb-6">
          Current lunch period updated successfully.
        </Alert>
      )}

      {params.error === "invalid-range" && (
        <Alert variant="error" className="mb-6">
          Enter a valid label and date range. Periods must remain contiguous with no gaps or overlaps.
        </Alert>
      )}

      {params.error && params.error !== "invalid-range" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that lunch period action.
        </Alert>
      )}

      <Card className="mb-8">
        <SectionHeader
          title="Current lunch period"
          description="Exactly one period may be current at a time. Staff see these dates on their home page."
        />

        {currentPeriod ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{currentPeriod.label}</h3>
                <StatusBadge status="active" />
              </div>
              <p className="mt-2 text-sm text-muted">
                {formatLunchPeriodRange(currentPeriod.start_date, currentPeriod.end_date)}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No current lunch period"
            description="Create a period below and mark it as current when ready."
          />
        )}

        {canExportLunchPeriodSummaries(profile.role) && (
          <div className="mt-6 border-t border-border pt-4">
            <Button disabled title="Coming in Batch 2B">
              Export to Excel
            </Button>
            <p className="mt-2 text-xs text-muted">
              Coming soon — export all staff summaries for the selected lunch period.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          {isFirstPeriod ? (
            <>
              <SectionHeader
                title="Create first period"
                description="Choose the start and end dates for the first payroll period."
              />
              <form action={createFirstLunchPeriod} className="space-y-4">
                <FormField label="Label" htmlFor="label">
                  <input id="label" name="label" required className={inputClassName} />
                </FormField>
                <FormField label="Start date" htmlFor="startDate">
                  <input id="startDate" name="startDate" type="date" required className={inputClassName} />
                </FormField>
                <FormField label="End date" htmlFor="endDate">
                  <input id="endDate" name="endDate" type="date" required className={inputClassName} />
                </FormField>
                <Button type="submit" variant="primary">
                  Create first period
                </Button>
              </form>
            </>
          ) : (
            <>
              <SectionHeader
                title="Append next period"
                description="The next period continues immediately after the previous period ends."
              />
              <form action={createNextLunchPeriod} className="space-y-4">
                <input type="hidden" name="derivedStartDate" value={nextStartDate ?? ""} />
                <FormField label="Label" htmlFor="next-label">
                  <input id="next-label" name="label" required className={inputClassName} />
                </FormField>
                <FormField label="Start date" htmlFor="derivedStartDate">
                  <input
                    id="derivedStartDate"
                    name="derivedStartDateDisplay"
                    type="date"
                    value={nextStartDate ?? ""}
                    readOnly
                    className={`${inputClassName} bg-slate-50 text-muted`}
                  />
                </FormField>
                <p className="text-xs text-muted">
                  Calculated automatically as the day after {latestPeriod?.label} ends (
                  {latestPeriod ? formatLunchPeriodRange(latestPeriod.start_date, latestPeriod.end_date) : ""}).
                </p>
                <FormField label="End date" htmlFor="next-endDate">
                  <input id="next-endDate" name="endDate" type="date" required className={inputClassName} />
                </FormField>
                <Button type="submit" variant="primary">
                  Append next period
                </Button>
              </form>
            </>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <SectionHeader
            title="All periods"
            description="Historical periods are retained. Period dates are locked once a later period exists."
          />

          {periods.length === 0 ? (
            <EmptyState
              title="No lunch periods yet"
              description="Create the first payroll period for your team."
            />
          ) : (
            <div className="space-y-4">
              {periods.map((period) => {
                const latest = isLatestLunchPeriod(period, periods);

                return (
                  <Card key={period.id} padding="sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{period.label}</h3>
                        {period.is_current && <StatusBadge status="active" />}
                      </div>
                      <p className="text-sm text-muted">
                        {formatLunchPeriodRange(period.start_date, period.end_date)}
                      </p>

                      <form action={updateLunchPeriodLabel} className="grid gap-3 md:grid-cols-2">
                        <input type="hidden" name="periodId" value={period.id} />
                        <FormField label="Label" htmlFor={`label-${period.id}`}>
                          <input
                            id={`label-${period.id}`}
                            name="label"
                            defaultValue={period.label}
                            required
                            className={inputClassName}
                          />
                        </FormField>
                        <div className="md:col-span-2">
                          <Button type="submit" variant="secondary">
                            Save label
                          </Button>
                        </div>
                      </form>

                      {latest ? (
                        <form action={updateLatestLunchPeriodEndDate} className="grid gap-3 md:grid-cols-2">
                          <input type="hidden" name="periodId" value={period.id} />
                          <FormField label="Start date" htmlFor={`start-${period.id}`}>
                            <input
                              id={`start-${period.id}`}
                              type="date"
                              value={period.start_date}
                              readOnly
                              className={`${inputClassName} bg-slate-50 text-muted`}
                            />
                          </FormField>
                          <FormField label="End date" htmlFor={`end-${period.id}`}>
                            <input
                              id={`end-${period.id}`}
                              name="endDate"
                              type="date"
                              defaultValue={period.end_date}
                              required
                              className={inputClassName}
                            />
                          </FormField>
                          <div className="md:col-span-2">
                            <Button type="submit" variant="secondary">
                              Adjust latest end date
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <p className="text-xs text-muted">
                          Start and end dates are locked because a later period already exists.
                        </p>
                      )}

                      {!period.is_current && (
                        <form action={setCurrentLunchPeriod}>
                          <input type="hidden" name="periodId" value={period.id} />
                          <Button type="submit" variant="primary">
                            Make current
                          </Button>
                        </form>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
