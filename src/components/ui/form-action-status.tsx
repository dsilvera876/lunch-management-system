import { forwardRef, type ReactNode } from "react";

export type FormActionStatusVariant = "success" | "error" | "info" | "warning";

const styles: Record<FormActionStatusVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-red-200 bg-red-50 text-red-950",
  info: "border-slate-200 bg-slate-50 text-slate-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

type Props = {
  variant?: FormActionStatusVariant;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function formatFormActionError(actionLabel: string, reason: string): string {
  const detail = reason.trim();

  if (!detail) {
    return actionLabel;
  }

  if (actionLabel.endsWith(".") || actionLabel.endsWith("!") || actionLabel.endsWith("?")) {
    return `${actionLabel} ${detail}`;
  }

  return `${actionLabel}. ${detail}`;
}

export const FormActionStatus = forwardRef<HTMLDivElement, Props>(function FormActionStatus(
  { variant = "info", children, className = "", id },
  ref,
) {
  const role = variant === "error" ? "alert" : "status";
  const ariaLive = variant === "error" ? "assertive" : "polite";

  return (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-live={ariaLive}
      tabIndex={variant === "error" ? -1 : undefined}
      className={`rounded-lg border px-4 py-3 text-sm font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </div>
  );
});
