"use client";

import { useState } from "react";
import {
  setCurrentLunchPeriod,
  updateLunchPeriodDetails,
} from "@/app/admin/lunch-periods/actions";
import {
  countLunchPeriodDays,
  formatLunchPeriodAdminDate,
  getLunchPeriodAdminStatus,
  isLatestLunchPeriod,
  type LunchPeriod,
} from "@/lib/lunch-periods";
import { LunchPeriodStatusBadge } from "@/components/admin/lunch-periods/lunch-period-status-badge";
import { IconHistory } from "@/components/icons/line-icons";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { SUPPORT_MODE_DISABLED_HINT } from "@/components/app-shell/support-mode-context";
import { LunchPeriodMutationForm } from "@/components/admin/lunch-periods/lunch-periods-workspace";
import {
  LUNCH_PERIOD_CURRENT_SUCCESS,
  LUNCH_PERIOD_UPDATED_SUCCESS,
} from "@/lib/lunch-period-action-feedback";

type Props = {
  periods: LunchPeriod[];
  readOnly?: boolean;
};

export function LunchPeriodsTable({ periods, readOnly = false }: Props) {
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);

  return (
    <Card padding="md" className="shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconHistory size={18} aria-hidden />
        </span>
        <SectionHeader
          title="All periods"
          description="Historical periods are retained. You can only edit the latest period."
        />
      </div>

      {periods.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No lunch periods yet"
            description="Create the first payroll period using the form beside this table."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border/80">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50/90 text-muted">
                <th className="px-3 py-2.5 font-medium">Label</th>
                <th className="px-3 py-2.5 font-medium">Start date</th>
                <th className="px-3 py-2.5 font-medium">End date</th>
                <th className="px-3 py-2.5 font-medium text-center">Calendar days</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {readOnly ? null : (
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const latest = isLatestLunchPeriod(period, periods);
                const status = getLunchPeriodAdminStatus(period);
                const isEditing = editingPeriodId === period.id;
                const totalDays = countLunchPeriodDays(period.start_date, period.end_date);

                return (
                  <PeriodTableRow
                    key={period.id}
                    period={period}
                    latest={latest}
                    status={status}
                    totalDays={totalDays}
                    isEditing={isEditing}
                    readOnly={readOnly}
                    onEdit={() => setEditingPeriodId(period.id)}
                    onCancel={() => setEditingPeriodId(null)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {periods.length > 0 && !readOnly ? (
        <p className="mt-4 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted">
          Only the most recent period can be edited. Start and end dates are locked once a later
          period exists.
        </p>
      ) : null}

      {readOnly && periods.length > 0 ? (
        <p className="mt-4 text-sm text-muted">{SUPPORT_MODE_DISABLED_HINT}</p>
      ) : null}
    </Card>
  );
}

function PeriodTableRow({
  period,
  latest,
  status,
  totalDays,
  isEditing,
  readOnly,
  onEdit,
  onCancel,
}: {
  period: LunchPeriod;
  latest: boolean;
  status: ReturnType<typeof getLunchPeriodAdminStatus>;
  totalDays: number;
  isEditing: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  if (isEditing && !readOnly) {
    return (
      <tr className="border-b border-border/70 bg-surface/80">
        <td colSpan={6} className="px-3 py-4">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">Edit {period.label}</p>
            <LunchPeriodMutationForm
              mutationAction={updateLunchPeriodDetails}
              successMessage={LUNCH_PERIOD_UPDATED_SUCCESS}
              focusAfterSuccessId={`edit-lunch-period-${period.id}`}
              className="grid gap-3 md:grid-cols-2"
              onSuccess={onCancel}
            >
              <input type="hidden" name="periodId" value={period.id} />
              <FormField label="Label" htmlFor={`edit-label-${period.id}`}>
                <PeriodEditInput
                  id={`edit-label-${period.id}`}
                  name="label"
                  initialValue={period.label}
                />
              </FormField>
              <div>
                <p className="text-sm font-medium text-foreground">Start date</p>
                <p className="mt-1 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {formatLunchPeriodAdminDate(period.start_date)}
                </p>
              </div>
              {latest ? (
                <FormField label="End date" htmlFor={`edit-end-${period.id}`}>
                  <PeriodEditInput
                    id={`edit-end-${period.id}`}
                    name="endDate"
                    type="date"
                    initialValue={period.end_date}
                  />
                </FormField>
              ) : (
                <div>
                  <input type="hidden" name="endDate" value={period.end_date} />
                  <p className="text-sm font-medium text-foreground">End date (locked)</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {formatLunchPeriodAdminDate(period.end_date)}
                  </p>
                </div>
              )}
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button type="submit" variant="primary">
                  Save Changes
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </LunchPeriodMutationForm>

            {!period.is_current ? (
              <LunchPeriodMutationForm
                mutationAction={setCurrentLunchPeriod}
                successMessage={LUNCH_PERIOD_CURRENT_SUCCESS}
                focusAfterSuccessId={`edit-lunch-period-${period.id}`}
                onSuccess={onCancel}
              >
                <input type="hidden" name="periodId" value={period.id} />
                <Button type="submit" variant="secondary">
                  Make current
                </Button>
              </LunchPeriodMutationForm>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="px-3 py-2.5 font-medium text-slate-900">
        <span
          id={`lunch-period-${period.id}-focus-target`}
          tabIndex={-1}
          className="rounded focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        >
          {period.label}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
        {formatLunchPeriodAdminDate(period.start_date)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
        {formatLunchPeriodAdminDate(period.end_date)}
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">{totalDays}</td>
      <td className="px-3 py-2.5">
        <LunchPeriodStatusBadge status={status} />
      </td>
      {readOnly ? null : (
        <td className="px-3 py-2.5 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              id={`edit-lunch-period-${period.id}`}
              type="button"
              variant="ghost"
              className="min-h-8 px-2 text-sm"
              onClick={onEdit}
            >
              Edit
            </Button>
            {!period.is_current ? (
              <LunchPeriodMutationForm
                mutationAction={setCurrentLunchPeriod}
                successMessage={LUNCH_PERIOD_CURRENT_SUCCESS}
                focusAfterSuccessId={`lunch-period-${period.id}-focus-target`}
                className="inline"
              >
                <input type="hidden" name="periodId" value={period.id} />
                <Button type="submit" variant="secondary" className="min-h-8 px-3 text-sm">
                  Make current
                </Button>
              </LunchPeriodMutationForm>
            ) : null}
          </div>
        </td>
      )}
    </tr>
  );
}

// React resets uncontrolled fields after a resolved form action, including an
// action returning a validation error. Retain drafts until this editor closes.
function PeriodEditInput({
  id, name, type = "text", initialValue,
}: {
  id: string;
  name: string;
  type?: "text" | "date";
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
      required
      className={inputClassName}
    />
  );
}
