"use client";

import { useState } from "react";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { updateDailyLunchSubsidy } from "@/app/admin/financials/actions";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { IconWallet } from "@/components/icons/line-icons";

type Props = {
  dailyLunchSubsidy: number;
  canEdit: boolean;
  returnTo: string;
  showUpdated?: boolean;
  showError?: boolean;
};

export function DailyLunchSubsidySetting({
  dailyLunchSubsidy,
  canEdit,
  returnTo,
  showUpdated = false,
  showError = false,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-lg border border-border/80 bg-white px-4 py-3 shadow-sm">
      {showUpdated ? (
        <FormActionStatus variant="success" className="mb-3">
          Daily lunch subsidy updated successfully.
        </FormActionStatus>
      ) : null}

      {showError ? (
        <FormActionStatus variant="error" className="mb-3">
          Unable to update daily lunch subsidy.
        </FormActionStatus>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <TealIconWell size="sm" className="mt-0.5">
            <IconWallet aria-hidden />
          </TealIconWell>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Daily Lunch Subsidy</p>
            {!editing ? (
              <>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">
                  {formatCurrency(dailyLunchSubsidy)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  Applied once per employee per qualifying order date.
                </p>
              </>
            ) : null}
          </div>
        </div>

        {canEdit && !editing ? (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 sm:self-center"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        ) : null}
      </div>

      {canEdit && editing ? (
        <form
          action={updateDailyLunchSubsidy}
          className="mt-4 flex flex-col gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="min-w-0 flex-1">
            <FormField label="Daily lunch subsidy" htmlFor="dailyLunchSubsidy">
            <input
              id="dailyLunchSubsidy"
              name="dailyLunchSubsidy"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={dailyLunchSubsidy}
              className={inputClassName}
            />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
