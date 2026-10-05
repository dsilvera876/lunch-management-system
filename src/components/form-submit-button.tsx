"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";
import { shouldBlockAriaDisabledActivation } from "@/lib/aria-disabled-activation";

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
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = forcePending || formPending;
  const nativeDisabled = pending || (disabled && !accessibilityBlocked);
  const softBlocked = accessibilityBlocked && !pending && !disabled;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (softBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (shouldBlockAriaDisabledActivation(softBlocked, event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <button
      type="submit"
      disabled={nativeDisabled}
      aria-disabled={softBlocked ? true : undefined}
      aria-describedby={ariaDescribedBy}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`${buttonClass(variant)} ${softBlocked ? "cursor-not-allowed opacity-60" : ""} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}