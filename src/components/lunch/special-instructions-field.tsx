"use client";

import { useId } from "react";
import { textareaClassName } from "@/components/ui/form-field";
import { joinDescribedBy } from "@/lib/staff-form-accessibility";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorMessage?: string | null;
  fieldId?: string;
};

export function SpecialInstructionsField({
  value,
  onChange,
  disabled = false,
  invalid = false,
  errorMessage = null,
  fieldId = "specialInstructions",
}: Props) {
  const helperId = useId();
  const errorId = useId();

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-slate-900">
        Special instructions{" "}
        <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id={fieldId}
        name={fieldId}
        rows={3}
        maxLength={500}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={joinDescribedBy(helperId, invalid && errorMessage ? errorId : undefined)}
        placeholder="Add any special instructions for this order…"
        className={`${textareaClassName} mt-2`}
      />
      <p id={helperId} className="mt-1 text-xs text-muted">
        Order-level notes for preparation or delivery. Up to 500 characters. Providers cannot
        guarantee allergy accommodation.
      </p>
      {invalid && errorMessage ? (
        <p id={errorId} className="mt-1 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
