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
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  className = "",
  variant = "secondary",
}: Props) {
  const { pending } = useFormStatus();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={handleClick}
      className={`${buttonClass(variant)} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}