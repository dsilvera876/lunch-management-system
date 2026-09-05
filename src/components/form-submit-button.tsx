"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  pendingText: string;
  confirmMessage?: string;
  className?: string;
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  className,
}: Props) {
  const { pending } = useFormStatus();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (
      confirmMessage &&
      !window.confirm(confirmMessage)
    ) {
      event.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={handleClick}
      className={className}
    >
      {pending ? pendingText : children}
    </button>
  );
}