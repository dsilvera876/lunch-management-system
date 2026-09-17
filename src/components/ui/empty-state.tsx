import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({ title, description, action, compact = false }: Props) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-background text-center ${
        compact ? "px-4 py-5" : "bg-surface px-6 py-10"
      }`}
    >
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
