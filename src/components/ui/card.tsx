import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  id?: string;
};

const paddingClasses = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className = "", padding = "md", id }: Props) {
  return (
    <div
      id={id}
      className={`rounded-xl border border-border bg-surface shadow-sm ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
