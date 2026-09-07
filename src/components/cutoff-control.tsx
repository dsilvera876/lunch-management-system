import {
  cutoffTimeToFormValue,
  DEFAULT_ORDER_CUTOFF_TIME,
  formatJamaicaWallClockTime,
} from "@/lib/settings";
import { updateOrderCutoff } from "@/app/admin/actions";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

type Props = {
  cutoffTime: string;
  returnTo: string;
  showUpdated?: boolean;
  showError?: boolean;
};

export function CutoffControl({
  cutoffTime,
  returnTo,
  showUpdated = false,
  showError = false,
}: Props) {
  const cutoffInputValue = cutoffTimeToFormValue(cutoffTime);

  return (
    <Card className="mb-8">
      <SectionHeader
        title="Daily order cutoff"
        description={`Current cutoff: ${formatJamaicaWallClockTime(cutoffTime)}.`}
      />

      {showUpdated && (
        <p className="mb-4 text-sm text-primary">Order cutoff updated successfully.</p>
      )}

      {showError && (
        <p className="mb-4 text-sm text-red-700">Unable to update order cutoff.</p>
      )}

      <form action={updateOrderCutoff} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <input type="hidden" name="returnTo" value={returnTo} />
        <FormField label="Cutoff time" htmlFor="orderCutoffTime">
          <input
            id="orderCutoffTime"
            name="orderCutoffTime"
            type="time"
            required
            defaultValue={cutoffInputValue}
            className={inputClassName}
          />
        </FormField>
        <Button type="submit" variant="primary">
          Save cutoff
        </Button>
      </form>
      <p className="mt-3 text-sm text-muted">
        Default if unset: {formatJamaicaWallClockTime(DEFAULT_ORDER_CUTOFF_TIME)}.
      </p>
    </Card>
  );
}
