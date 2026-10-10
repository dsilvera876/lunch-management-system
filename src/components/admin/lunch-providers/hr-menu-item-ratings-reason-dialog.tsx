"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { formControlLabelClassName, textareaClassName } from "@/components/ui/form-field";
import { IconX } from "@/components/icons/line-icons";
import { focusFormErrorSummary } from "@/lib/staff-form-accessibility";

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  title: string;
  description: string;
  confirmLabel: string;
  reasonRequired?: boolean;
  showReasonField?: boolean;
  reasonLabel?: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onSuccess: (message: string) => void;
};

export function HrMenuItemRatingsReasonDialog({
  open,
  triggerRef,
  title,
  description,
  confirmLabel,
  reasonRequired = true,
  showReasonField = true,
  reasonLabel = "Reason",
  destructive = false,
  onOpenChange,
  onConfirm,
  onSuccess,
}: Props) {
  const titleId = useId();
  const reasonId = useId();
  const reasonHelperId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (error) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [error]);

  useEffect(() => {
    if (!open) {
      return;
    }
    resetDialogState();
    window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, [open, title]);

  function restoreDialogFocus() {
    const target = triggerRef.current;
    if (target?.isConnected) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
      return;
    }
    const main = document.getElementById("main-content");
    if (!main) {
      return;
    }
    const preferredLabels = ["Disable ratings", "Enable ratings", "Reset all ratings"];
    for (const label of preferredLabels) {
      const match = Array.from(main.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === label,
      );
      if (match instanceof HTMLElement && match.isConnected) {
        try {
          match.focus({ preventScroll: true });
        } catch {
          match.focus();
        }
        return;
      }
    }
  }

  function dismissModal() {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      restoreDialogFocus();
    });
  }

  function resetDialogState() {
    setReason("");
    setError(null);
    setSubmitting(false);
    submitLockRef.current = false;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetDialogState();
      dismissModal();
      return;
    }
    onOpenChange(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLockRef.current) {
      return;
    }

    setError(null);
    const trimmed = reason.trim();
    if (reasonRequired && trimmed.length === 0) {
      setError("Enter a reason to continue.");
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    startTransition(async () => {
      const result = await onConfirm(trimmed);
      if (!result.ok) {
        submitLockRef.current = false;
        setSubmitting(false);
        setError(result.message);
        return;
      }

      dismissModal();
      onSuccess("Changes saved.");
    });
  }

  return (
    <FocusTrapPopover
      open={open}
      onOpenChange={handleOpenChange}
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
        aria-label="Close dialog"
        onClick={dismissModal}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900 outline-none"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <Button type="button" variant="ghost" aria-label="Close" onClick={dismissModal}>
            <IconX size={18} aria-hidden />
          </Button>
        </div>

        {error ? (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {showReasonField ? (
            <div>
              <label htmlFor={reasonId} className={formControlLabelClassName}>
                {reasonLabel}{" "}
                {reasonRequired ? <span className="text-red-700">(required)</span> : null}
              </label>
              <textarea
                id={reasonId}
                name="reason"
                rows={3}
                maxLength={500}
                required={reasonRequired}
                aria-describedby={reasonHelperId}
                className={textareaClassName}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitting}
              />
              <p id={reasonHelperId} className="mt-1 text-xs text-muted">
                Up to 500 characters. Recorded in the moderation audit log.
              </p>
            </div>
          ) : null}

          <div
            className={`flex flex-wrap justify-end gap-2 ${showReasonField ? "border-t border-border pt-4" : ""}`}
          >
            <Button type="button" variant="secondary" onClick={dismissModal} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "danger" : "primary"}
              disabled={submitting}
            >
              {submitting ? "Saving…" : confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </FocusTrapPopover>
  );
}
