import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  descriptionClassName?: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, descriptionClassName, actions }: Props) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className={`mt-1 text-sm ${descriptionClassName ?? "text-muted"}`}>{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}
