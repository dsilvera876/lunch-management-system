"use client";

import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { updateDailyLunchSubsidy } from "@/app/admin/financials/actions";

type Props = {
  dailyLunchSubsidy: number;
  canEdit: boolean;
  returnTo: string;
  showUpdated?: boolean;
  showError?: boolean;
};

export function DailyLunchSubsidyControl({
  dailyLunchSubsidy,
  canEdit,
  returnTo,
  showUpdated = false,
  showError = false,
}: Props) {
  return (
    <Card className="mb-8">
      <SectionHeader
        title="Daily lunch subsidy"
        description={
          canEdit
            ? "Company-wide amount applied once per employee per order date."
            : `Current daily lunch subsidy: ${formatCurrency(dailyLunchSubsidy)}`
        }
      />

      {showUpdated && (
        <p className="mb-4 text-sm text-primary">Daily lunch subsidy updated successfully.</p>
      )}

      {showError && (
        <p className="mb-4 text-sm text-red-700">Unable to update daily lunch subsidy.</p>
      )}

      {canEdit ? (
        <form action={updateDailyLunchSubsidy} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <input type="hidden" name="returnTo" value={returnTo} />
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
          <Button type="submit" variant="primary">
            Save subsidy
          </Button>
        </form>
      ) : (
        <p className="text-2xl font-semibold">{formatCurrency(dailyLunchSubsidy)}</p>
      )}
    </Card>
  );
}
