"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  pendingText: string;
  confirmMessage?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  forcePending?: boolean;
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  className = "",
  variant = "secondary",
  disabled = false,
  forcePending = false,
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = forcePending || formPending;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={handleClick}
      className={`${buttonClass(variant)} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}