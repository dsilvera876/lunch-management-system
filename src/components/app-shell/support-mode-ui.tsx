"use client";

import {
  SUPPORT_MODE_DISABLED_HINT,
  useSupportMode,
} from "@/components/app-shell/support-mode-context";

type SupportModeMutationHintProps = {
  className?: string;
};

export function SupportModeMutationHint({ className = "" }: SupportModeMutationHintProps) {
  const { readOnly } = useSupportMode();
  if (!readOnly) {
    return null;
  }

  return (
    <p className={`text-sm text-muted ${className}`.trim()}>{SUPPORT_MODE_DISABLED_HINT}</p>
  );
}

export function SupportModeReadOnlyPanel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { readOnly } = useSupportMode();
  if (!readOnly) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-slate-50/80 px-4 py-4 shadow-sm">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <p className="mt-3 text-sm text-muted">{SUPPORT_MODE_DISABLED_HINT}</p>
    </div>
  );
}
