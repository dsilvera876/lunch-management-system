import { forwardRef, type ButtonHTMLAttributes } from "react";
import { STAFF_PRIMARY_CTA_CLASS } from "@/lib/staff-visual-contrast";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover border-transparent",
  secondary:
    "bg-surface text-foreground border-border hover:bg-slate-50",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-slate-100",
  danger:
    "bg-red-600 text-white hover:bg-red-700 border-transparent",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Staff Phase C1: darker teal for primary button label contrast. */
  staffPrimaryCta?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", className = "", type = "button", staffPrimaryCta = false, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${
        staffPrimaryCta && variant === "primary"
          ? `${STAFF_PRIMARY_CTA_CLASS} hover:bg-[#115e59]`
          : ""
      } ${className}`}
      {...props}
    />
  );
});

export function buttonClass(variant: Variant = "secondary") {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]}`;
}

export function linkButtonClass(variant: Variant = "secondary") {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium no-underline transition-colors ${variantClasses[variant]}`;
}
