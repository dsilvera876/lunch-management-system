import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Staff routes: use Phase C1 instruction text color for AA contrast on app background. */
  staffAccessibleDescription?: boolean;
};

export function PageHeader({
  title,
  description,
  actions,
  className = "",
  staffAccessibleDescription = false,
}: Props) {
  return (
    <div
      className={`mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p
            className={`mt-2 max-w-3xl text-sm leading-6 ${
              staffAccessibleDescription ? "text-staff-instruction" : "text-muted"
            }`}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
