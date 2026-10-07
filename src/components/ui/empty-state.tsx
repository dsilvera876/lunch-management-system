import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** Defaults to `text-muted`; Staff surfaces should pass `text-staff-instruction`. */
  descriptionClassName?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  descriptionClassName = "text-muted",
  action,
  compact = false,
}: Props) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-background text-center ${
        compact ? "px-4 py-5" : "bg-surface px-6 py-10"
      }`}
    >
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className={`mx-auto mt-2 max-w-md text-sm ${descriptionClassName}`}>{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
