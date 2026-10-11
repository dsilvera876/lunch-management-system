"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { HrMenuItemRatingsAuditLogPanel } from "@/components/admin/lunch-providers/hr-menu-item-ratings-audit-log";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { IconX } from "@/components/icons/line-icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  providerId: string;
  reloadToken?: number;
};

function restoreDialogFocus(triggerRef: RefObject<HTMLElement | null>) {
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
  const viewActivity = main?.querySelector<HTMLElement>('button[data-hr-ratings-activity-trigger="true"]');
  if (viewActivity?.isConnected) {
    try {
      viewActivity.focus({ preventScroll: true });
    } catch {
      viewActivity.focus();
    }
  }
}

export function HrMenuItemRatingsAuditLogModal({
  open,
  onOpenChange,
  triggerRef,
  providerId,
  reloadToken = 0,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, [open]);

  function dismissModal() {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      restoreDialogFocus(triggerRef);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      dismissModal();
      return;
    }
    onOpenChange(true);
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
        aria-label="Close rating activity dialog"
        onClick={dismissModal}
      />
      <div className="relative z-10 flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 pr-2">
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900 outline-none"
            >
              Rating activity log
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              HR moderation history for this provider (newest first).
            </p>
          </div>
          <Button type="button" variant="ghost" aria-label="Close" onClick={dismissModal}>
            <IconX size={18} aria-hidden />
          </Button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          aria-describedby={descriptionId}
        >
          {open ? (
            <HrMenuItemRatingsAuditLogPanel
              providerId={providerId}
              reloadToken={reloadToken}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-4">
          <Button type="button" variant="secondary" onClick={dismissModal}>
            Cancel
          </Button>
        </div>
      </div>
    </FocusTrapPopover>
  );
}
