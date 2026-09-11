import {
  cutoffTimeToFormValue,
  formatJamaicaWallClockTime,
} from "@/lib/settings";
import { updateOrderCutoff } from "@/app/admin/actions";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { FormActionStatus } from "@/components/ui/form-action-status";
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
    <div className="mb-6">
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium text-muted">
          Order cutoff: <span className="text-foreground">{formatJamaicaWallClockTime(cutoffTime)}</span>
        </p>
        <details className="group relative">
          <summary className="cursor-pointer text-sm font-medium text-primary hover:underline list-none">
            Change
          </summary>
          <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
            <form action={updateOrderCutoff} className="flex flex-col gap-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <FormField label="New cutoff time" htmlFor="orderCutoffTime">
                <input
                  id="orderCutoffTime"
                  name="orderCutoffTime"
                  type="time"
                  required
                  defaultValue={cutoffInputValue}
                  className={inputClassName}
                />
              </FormField>
              <Button type="submit" variant="primary" className="w-full justify-center">
                Save
              </Button>
            </form>
          </div>
        </details>
      </div>

      {showUpdated ? (
        <FormActionStatus variant="success" className="mt-3">
          Order cutoff updated successfully.
        </FormActionStatus>
      ) : null}

      {showError ? (
        <FormActionStatus variant="error" className="mt-3">
          Unable to update order cutoff.
        </FormActionStatus>
      ) : null}
    </div>
  );
}
