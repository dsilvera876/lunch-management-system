"use client";

import { textareaClassName } from "@/components/ui/form-field";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function SpecialInstructionsField({ value, onChange, disabled = false }: Props) {
  return (
    <div>
      <label htmlFor="specialInstructions" className="block text-sm font-medium text-slate-900">
        Special Instructions{" "}
        <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="specialInstructions"
        name="specialInstructions"
        rows={3}
        maxLength={500}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add any special instructions for this order…"
        className={`${textareaClassName} mt-2`}
      />
      <p className="mt-1 text-xs text-muted">
        Order-level notes for preparation or delivery. Up to 500 characters. Providers cannot
        guarantee allergy accommodation.
      </p>
    </div>
  );
}
