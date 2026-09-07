import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
};

const paddingClasses = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className = "", padding = "md" }: Props) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-sm ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
