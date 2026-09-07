import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor: string;
  description?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, description, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {description && (
        <p id={`${htmlFor}-description`} className="text-sm text-muted">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export const inputClassName =
  "block w-full min-h-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary";

export const textareaClassName =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary";

export const selectClassName = inputClassName;
