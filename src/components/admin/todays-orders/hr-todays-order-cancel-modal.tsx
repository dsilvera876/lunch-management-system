"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { hrCancelStaffOrderAction } from "@/app/admin/todays-orders/actions";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { formControlLabelClassName, textareaClassName } from "@/components/ui/form-field";
import { IconX } from "@/components/icons/line-icons";
import { formatTodaysOrderDisplayDate } from "@/lib/todays-orders-presentation";
import type { OperationalOrder } from "@/lib/operational-orders";
import { focusFormErrorSummary } from "@/lib/staff-form-accessibility";
import { normalizeHrOrderMutationReason } from "@/lib/hr-todays-order-mutation";
import {
  hrCancelModalDraftForOrder,
  hrCancelModalDraftOnSessionEnd,
  hrCancelSubmitCompletion,
  shouldStartHrCancelSubmit,
} from "@/lib/hr-todays-order-cancel-modal-session";

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  order: OperationalOrder;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
};

export function HrTodaysOrderCancelModal({
  open,
  triggerRef,
  order,
  onOpenChange,
  onSuccess,
}: Props) {
  const titleId = useId();
  const reasonId = useId();
  const reasonHelperId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const sessionRef = useRef(0);
  const [trackedOrderId, setTrackedOrderId] = useState(order.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  if (trackedOrderId !== order.id) {
    const switchedDraft = hrCancelModalDraftForOrder(trackedOrderId, order.id, {
      reason,
      error,
      submitting,
    });
    setTrackedOrderId(order.id);
    setReason(switchedDraft.reason);
    setError(switchedDraft.error);
    setSubmitting(switchedDraft.submitting);
  }

  useLayoutEffect(() => {
    sessionRef.current += 1;
    submitLockRef.current = false;
  }, [order.id]);

  useEffect(() => {
    if (error) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [error]);

  function applyDraftReset() {
    sessionRef.current += 1;
    submitLockRef.current = false;
    const cleared = hrCancelModalDraftOnSessionEnd();
    setReason(cleared.reason);
    setError(cleared.error);
    setSubmitting(cleared.submitting);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      applyDraftReset();
    }
    onOpenChange(nextOpen);
  }

  function dismissModal() {
    handleOpenChange(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!shouldStartHrCancelSubmit(submitLockRef.current)) {
      return;
    }

    setError(null);

    const normalized = normalizeHrOrderMutationReason(reason);
    if (!normalized) {
      setError("Enter a reason for this HR cancellation.");
      return;
    }

    const session = sessionRef.current;
    submitLockRef.current = true;
    setSubmitting(true);

    startTransition(async () => {
      const result = await hrCancelStaffOrderAction({
        orderId: order.id,
        reason: normalized,
        expectedUpdatedAt: order.updatedAt,
      });

      const completion = hrCancelSubmitCompletion({
        sessionMatches: session === sessionRef.current,
        ok: result.ok,
      });

      if (completion === "ignore") {
        return;
      }

      if (completion === "notify-only") {
        onSuccess("Order cancelled. The employee will be notified by email.");
        return;
      }

      if (completion === "apply-error") {
        submitLockRef.current = false;
        setSubmitting(false);
        if (!result.ok) {
          setError(result.error);
        }
        return;
      }

      dismissModal();
      onSuccess("Order cancelled. The employee will be notified by email.");
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
        aria-label="Close cancel order dialog"
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
              Cancel employee order
            </h2>
            <p className="mt-1 text-sm text-muted">
              {order.employeeName} · {order.providerName} · delivery{" "}
              {formatTodaysOrderDisplayDate(order.deliveryDate)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close"
            onClick={dismissModal}
          >
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
          <div>
            <label htmlFor={reasonId} className={formControlLabelClassName}>
              Reason <span className="text-red-700">(required)</span>
            </label>
            <textarea
              id={reasonId}
              name="reason"
              rows={3}
              maxLength={1000}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`${textareaClassName} mt-1.5`}
              aria-describedby={reasonHelperId}
            />
            <p id={reasonHelperId} className="mt-1 text-xs text-muted">
              Internal HR record only. Not included in the employee email.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={dismissModal}>
              Keep order
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={submitting}
              aria-busy={submitting || undefined}
            >
              {submitting ? "Cancelling…" : "Cancel order"}
            </Button>
          </div>
        </form>
      </div>
    </FocusTrapPopover>
  );
}
