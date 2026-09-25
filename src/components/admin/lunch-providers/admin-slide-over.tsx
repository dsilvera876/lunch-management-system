"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function AdminSlideOver({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      <aside className="relative flex h-[min(92vh,100%)] w-full max-w-lg flex-col overflow-hidden border border-border bg-surface shadow-xl sm:rounded-l-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/40"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
