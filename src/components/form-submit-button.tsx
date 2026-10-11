"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";
import { shouldBlockAriaDisabledActivation } from "@/lib/aria-disabled-activation";
import { STAFF_PRIMARY_CTA_CLASS } from "@/lib/staff-visual-contrast";

type Props = {
  children: ReactNode;
  pendingText: string;
  confirmMessage?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  forcePending?: boolean;
  /** Keeps the control focusable while blocking activation (aria-disabled). */
  accessibilityBlocked?: boolean;
  ariaDescribedBy?: string;
  /** Called instead of submitting when an accessibilityBlocked button is activated. */
  onBlockedActivate?: () => void;
  /** While pending, use aria-disabled instead of native disabled so focus is not dropped. */
  focusableWhilePending?: boolean;
  /** Staff Phase C1: darker teal background for primary submit contrast. */
  staffPrimaryCta?: boolean;
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  className = "",
  variant = "secondary",
  disabled = false,
  forcePending = false,
  accessibilityBlocked = false,
  ariaDescribedBy,
  onBlockedActivate,
  focusableWhilePending = false,
  staffPrimaryCta = false,
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = forcePending || formPending;
  const pendingBlocked = pending && focusableWhilePending;
  const nativeDisabled = (pending && !focusableWhilePending) || (disabled && !accessibilityBlocked);
  const softBlocked = accessibilityBlocked && !pending && !disabled;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (softBlocked || pendingBlocked) {
      event.preventDefault();
      event.stopPropagation();
      if (softBlocked) {
        onBlockedActivate?.();
      }
      return;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (softBlocked && onBlockedActivate) {
      return;
    }

    if (shouldBlockAriaDisabledActivation(softBlocked || pendingBlocked, event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <button
      type="submit"
      disabled={nativeDisabled}
      aria-disabled={softBlocked || pendingBlocked ? true : undefined}
      aria-busy={pending ? true : undefined}
      aria-describedby={ariaDescribedBy}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`${buttonClass(variant)} ${
        staffPrimaryCta && variant === "primary"
          ? `${STAFF_PRIMARY_CTA_CLASS} hover:bg-[#115e59]`
          : ""
      } ${softBlocked ? "cursor-not-allowed opacity-60" : ""} ${
        pendingBlocked ? "cursor-not-allowed opacity-50" : ""
      } ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}