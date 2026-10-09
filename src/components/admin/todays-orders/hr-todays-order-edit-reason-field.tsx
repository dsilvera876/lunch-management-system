"use client";

import { useLayoutEffect, type RefObject } from "react";
import { formControlLabelClassName, textareaClassName } from "@/components/ui/form-field";
import { HR_EDIT_REASON_LABEL } from "@/lib/hr-todays-order-edit-modal-presentation";
import { joinDescribedBy } from "@/lib/staff-form-accessibility";

type Props = {
  reasonId: string;
  reasonHelperId: string;
  reasonErrorId: string;
  reason: string;
  reasonError: string | null;
  onReasonChange: (value: string) => void;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
};

export function HrTodaysOrderEditReasonField({
  reasonId,
  reasonHelperId,
  reasonErrorId,
  reason,
  reasonError,
  onReasonChange,
  fieldRef,
}: Props) {
  useLayoutEffect(() => {
    if (!reasonError) {
      return;
    }
    fieldRef?.current?.scrollIntoView({ block: "nearest" });
  }, [fieldRef, reasonError]);

  return (
    <div>
      <label htmlFor={reasonId} className={formControlLabelClassName}>
        {HR_EDIT_REASON_LABEL}{" "}
        <span className="text-red-700">(required)</span>
      </label>
      <textarea
        id={reasonId}
        ref={fieldRef}
        rows={3}
        maxLength={1000}
        aria-required={true}
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        className={`${textareaClassName} mt-1.5`}
        aria-invalid={reasonError ? true : undefined}
        aria-describedby={joinDescribedBy(reasonHelperId, reasonError ? reasonErrorId : undefined)}
      />
      <p id={reasonHelperId} className="mt-1 text-xs text-muted">
        Internal HR record only. Not included in the employee email.
      </p>
      {reasonError ? (
        <p id={reasonErrorId} role="alert" className="mt-1 text-sm text-red-800">
          {reasonError}
        </p>
      ) : null}
    </div>
  );
}
