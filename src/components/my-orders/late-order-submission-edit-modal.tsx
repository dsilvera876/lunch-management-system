"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";
import { updateStaffLateOrderRequestAction } from "@/app/home/staff-late-order-request-actions";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { formControlLabelClassName, inputClassName } from "@/components/ui/form-field";
import { IconX } from "@/components/icons/line-icons";
import { focusFormErrorSummary, joinDescribedBy } from "@/lib/staff-form-accessibility";

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  request: StaffLateOrderRequestRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

type FieldKey = "summary" | "quantity" | "instructions";

function LateOrderSubmissionEditModalContent({
  triggerRef,
  request,
  onOpenChange,
  onSaved,
}: Omit<Props, "open">) {
  const titleId = useId();
  const errorSummaryId = useId();
  const summaryFieldId = useId();
  const quantityFieldId = useId();
  const instructionsFieldId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  const closeAndRestoreFocus = useCallback(() => {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onOpenChange, triggerRef]);

  const [summary, setSummary] = useState(() => request.requested_summary);
  const [quantity, setQuantity] = useState(() => String(request.quantity));
  const [instructions, setInstructions] = useState(() => request.special_instructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | "general" | null>(null);

  useEffect(() => {
    if (error) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [error]);

  function validate(): boolean {
    if (!summary.trim()) {
      setError("Describe what you would like to order.");
      setInvalidField("summary");
      return false;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
      setError("Quantity must be between 1 and 10.");
      setInvalidField("quantity");
      return false;
    }

    if (instructions.length > 500) {
      setError("Special instructions must be 500 characters or fewer.");
      setInvalidField("instructions");
      return false;
    }

    return true;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInvalidField(null);

    if (!validate()) {
      return;
    }

    startTransition(async () => {
      const result = await updateStaffLateOrderRequestAction({
        requestId: request.id,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
        expectedUpdatedAt: request.updated_at,
      });

      if (!result.ok) {
        setError(result.error);
        setInvalidField("general");
        return;
      }

      closeAndRestoreFocus();
      onSaved();
    });
  }

  return (
    <FocusTrapPopover
      open
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      labelId={titleId}
      modal
      anchorPosition={false}
      initialFocusRef={headingRef}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close edit late order submission dialog"
        onClick={closeAndRestoreFocus}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Edit late order submission
          </h2>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close"
            onClick={closeAndRestoreFocus}
          >
            <IconX size={18} />
          </Button>
        </div>

        {error ? (
          <FormActionStatus ref={errorSummaryRef} id={errorSummaryId} variant="error" className="mt-3">
            {error}
          </FormActionStatus>
        ) : null}

        <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor={summaryFieldId} className={formControlLabelClassName}>
              What I&apos;d like
            </label>
            <textarea
              id={summaryFieldId}
              className={inputClassName}
              rows={3}
              maxLength={500}
              required
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                setError(null);
                setInvalidField(null);
              }}
              aria-invalid={invalidField === "summary" || undefined}
            />
          </div>
          <div>
            <label htmlFor={quantityFieldId} className={formControlLabelClassName}>
              Quantity
            </label>
            <input
              id={quantityFieldId}
              className={inputClassName}
              type="number"
              min={1}
              max={10}
              required
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setError(null);
                setInvalidField(null);
              }}
              aria-invalid={invalidField === "quantity" || undefined}
            />
          </div>
          <div>
            <label htmlFor={instructionsFieldId} className={formControlLabelClassName}>
              Special instructions <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id={instructionsFieldId}
              className={inputClassName}
              rows={2}
              maxLength={500}
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                setError(null);
                setInvalidField(null);
              }}
              aria-invalid={invalidField === "instructions" || undefined}
              aria-describedby={joinDescribedBy()}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" variant="primary" staffPrimaryCta>
              Save changes
            </Button>
            <Button type="button" variant="ghost" onClick={closeAndRestoreFocus}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </FocusTrapPopover>
  );
}

export function LateOrderSubmissionEditModal({
  open,
  triggerRef,
  request,
  onOpenChange,
  onSaved,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <LateOrderSubmissionEditModalContent
      key={`${request.id}:${request.updated_at}`}
      triggerRef={triggerRef}
      request={request}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}
