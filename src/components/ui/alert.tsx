import type { ReactNode } from "react";

type Variant = "success" | "error" | "info";

const styles: Record<Variant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-slate-50 text-slate-800",
};

type Props = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

export function Alert({ variant = "info", children, className = "" }: Props) {
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${styles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
