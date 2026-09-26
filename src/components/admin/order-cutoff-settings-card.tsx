import { IconClock } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { updateOrderCutoff } from "@/app/admin/actions";
import { cutoffTimeToFormValue } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { Button } from "@/components/ui/button";

type Props = {
  cutoffTime: string;
  returnTo: string;
  cutoffDraft?: string;
  showError?: boolean;
  errorKind?: "invalid-cutoff" | "cutoff-update";
};

export function OrderCutoffSettingsCard({
  cutoffTime,
  returnTo,
  cutoffDraft,
  showError = false,
  errorKind,
}: Props) {
  const inputDefault = cutoffTimeToFormValue(
    cutoffDraft && /^\d{2}:\d{2}$/.test(cutoffDraft) ? `${cutoffDraft}:00` : cutoffTime,
  );

  return (
    <Card padding="md" className="shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <TealIconWell size="md" className="rounded-xl">
          <IconClock size={20} aria-hidden />
        </TealIconWell>

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Order cutoff time (Jamaica)</h2>
          <p className="mt-1 text-sm text-muted">
            System-wide deadline for staff lunch orders. Changes apply to the ordering workflow
            immediately.
          </p>

          <form
            action={updateOrderCutoff}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="min-w-[12rem] flex-1 sm:max-w-xs">
              <FormField label="Order cutoff time" htmlFor="orderCutoffTime">
                <input
                  id="orderCutoffTime"
                  name="orderCutoffTime"
                  type="time"
                  required
                  defaultValue={inputDefault}
                  className={inputClassName}
                />
              </FormField>
            </div>
            <Button type="submit" variant="primary" className="sm:mb-0.5">
              Save cutoff
            </Button>
          </form>

          {showError ? (
            <FormActionStatus variant="error" className="mt-3">
              {errorKind === "invalid-cutoff"
                ? "Enter a valid cutoff time."
                : "Unable to update order cutoff."}
            </FormActionStatus>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
