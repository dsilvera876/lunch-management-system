"use client";

import { useId, useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import type { OperationalOrder } from "@/lib/operational-orders";

type Props = {
  order: OperationalOrder | null;
  open: boolean;
  processing: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeliveryUndoConfirmDialog({ order, open, processing, triggerRef, onOpenChange, onConfirm }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  function restoreTriggerFocus() {
    const trigger = triggerRef.current;
    if (!trigger?.isConnected) {
      return;
    }

    try {
      trigger.focus({ preventScroll: true });
    } catch {
      trigger.focus();
    }
  }

  function dismissModal() {
    onOpenChange(false);
    window.requestAnimationFrame(restoreTriggerFocus);
  }

  function handleOpenChange(nextOpen: boolean) {
    // FocusTrapPopover restores focus for Escape and outside-pointer dismissal.
    // Cancel and the backdrop call dismissModal so they receive the same restoration.
    onOpenChange(nextOpen);
  }

  return (
    <FocusTrapPopover open={open} onOpenChange={handleOpenChange} triggerRef={triggerRef} labelId={titleId} describedById={descriptionId} modal anchorPosition={false} initialFocusRef={headingRef} className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Cancel undo delivery" disabled={processing} onClick={dismissModal} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
          Undo delivery for {order?.employeeName ?? "this order"}?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted">
          This returns the order to Pending. Any existing menu-rating eligibility may be invalidated.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={processing} onClick={dismissModal}>Cancel</Button>
          <Button type="button" variant="danger" disabled={processing} onClick={onConfirm}>
            {processing ? "Undoing delivery…" : "Undo delivery"}
          </Button>
        </div>
      </div>
    </FocusTrapPopover>
  );
}
