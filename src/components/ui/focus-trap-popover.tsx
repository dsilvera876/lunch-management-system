"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { getFocusableElements, handleFocusTrapKeyDown } from "@/lib/focus-trap";
import {
  computeAnchorFixedStyle,
  shouldRecoverFocusIntoModal,
  STAFF_MODAL_LAYER_ID,
  staffModalInert,
} from "@/lib/modal-inert";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  /** Used for aria-labelledby on the dialog surface. */
  labelId: string;
  modal?: boolean;
  className?: string;
  children: ReactNode;
  /** When set, focus this element on open instead of the first focusable child. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Portals to the staff modal layer and positions with fixed coordinates. */
  anchorPosition?: boolean;
};

function getModalLayer(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(STAFF_MODAL_LAYER_ID);
}

function closeModal(
  onOpenChange: (open: boolean) => void,
  triggerRef: RefObject<HTMLElement | null>,
) {
  onOpenChange(false);
  window.requestAnimationFrame(() => {
    triggerRef.current?.focus();
  });
}

function attachModalPopoverListeners(options: {
  trappedPanel: HTMLDivElement;
  modal: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  updateAnchorPosition: () => void;
  onRemoveListeners: (remove: () => void) => void;
}) {
  const {
    trappedPanel,
    modal,
    initialFocusRef,
    triggerRef,
    onOpenChange,
    updateAnchorPosition,
    onRemoveListeners,
  } = options;

  function focusInitialTarget() {
    const focusTarget =
      initialFocusRef?.current ??
      getFocusableElements(trappedPanel)[0] ??
      trappedPanel;
    focusTarget.focus();
  }

  focusInitialTarget();
  updateAnchorPosition();

  function handlePointerDown(event: MouseEvent) {
    const target = event.target as Node;
    if (trappedPanel.contains(target)) {
      return;
    }
    closeModal(onOpenChange, triggerRef);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(onOpenChange, triggerRef);
      return;
    }

    if (modal) {
      handleFocusTrapKeyDown(event, trappedPanel);
    }
  }

  function handleFocusIn(event: FocusEvent) {
    if (!modal) {
      return;
    }

    const target = event.target as Node | null;
    if (
      !shouldRecoverFocusIntoModal({
        modalOpen: true,
        modalRoot: trappedPanel,
        activeElement: target,
        triggerElement: triggerRef.current,
        allowTriggerFocus: false,
      })
    ) {
      return;
    }

    event.stopPropagation();
    focusInitialTarget();
  }

  document.addEventListener("mousedown", handlePointerDown);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("focusin", handleFocusIn, true);
  onRemoveListeners(() => {
    document.removeEventListener("mousedown", handlePointerDown);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", handleFocusIn, true);
  });
}

export function FocusTrapPopover({
  open,
  onOpenChange,
  triggerRef,
  labelId,
  modal = true,
  className = "",
  children,
  initialFocusRef,
  anchorPosition = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const modalLayer =
    open && modal && typeof document !== "undefined" ? getModalLayer() : null;

  const updateAnchorPosition = useCallback(() => {
    if (!anchorPosition || !open) {
      return;
    }

    const anchor = triggerRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 280;
    const { top, left } = computeAnchorFixedStyle(
      rect,
      panelWidth,
      window.innerWidth,
    );

    panel.style.position = "fixed";
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.zIndex = "60";
    panel.style.visibility = "visible";
  }, [anchorPosition, open, triggerRef]);

  useLayoutEffect(() => {
    if (!open || !anchorPosition) {
      return;
    }

    updateAnchorPosition();
    window.addEventListener("resize", updateAnchorPosition);
    window.addEventListener("scroll", updateAnchorPosition, true);
    return () => {
      window.removeEventListener("resize", updateAnchorPosition);
      window.removeEventListener("scroll", updateAnchorPosition, true);
    };
  }, [open, anchorPosition, updateAnchorPosition]);

  useEffect(() => {
    if (!open || !modal) {
      return;
    }

    staffModalInert.acquire();

    return () => {
      staffModalInert.release();
    };
  }, [open, modal]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (modal && !modalLayer) {
      return;
    }

    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    const frame = window.requestAnimationFrame(() => {
      const currentPanel = panelRef.current;
      if (cancelled || !currentPanel) {
        return;
      }

      attachModalPopoverListeners({
        trappedPanel: currentPanel,
        modal,
        initialFocusRef,
        triggerRef,
        onOpenChange,
        updateAnchorPosition,
        onRemoveListeners: (remove) => {
          removeListeners = remove;
        },
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      removeListeners?.();
    };
  }, [
    open,
    modal,
    modalLayer,
    onOpenChange,
    triggerRef,
    initialFocusRef,
    updateAnchorPosition,
  ]);

  if (!open) {
    return null;
  }

  const dialog = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={modal ? "true" : undefined}
      aria-labelledby={labelId}
      className={className}
      style={
        anchorPosition
          ? { position: "fixed", visibility: "hidden" }
          : undefined
      }
      data-staff-modal-dialog
    >
      {children}
    </div>
  );

  if (modal) {
    if (!modalLayer) {
      return null;
    }
    return createPortal(dialog, modalLayer);
  }

  return dialog;
}
