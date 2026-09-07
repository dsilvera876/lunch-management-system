import type { ButtonHTMLAttributes } from "react";

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
};

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

export function buttonClass(variant: Variant = "secondary") {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]}`;
}

export function linkButtonClass(variant: Variant = "secondary") {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium no-underline transition-colors ${variantClasses[variant]}`;
}
