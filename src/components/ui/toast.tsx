"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error";

export type ToastInput = {
  title: string;
  body?: string;
  variant?: ToastVariant;
  action?: { label: string; href: string };
  /** Omit or set for errors to keep the toast until dismissed. */
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: string;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_SUCCESS_DURATION_MS = 7000;

const variantStyles: Record<
  ToastVariant,
  { container: string; title: string; body: string; dismiss: string }
> = {
  success: {
    container: "border-emerald-200 bg-emerald-50 ring-emerald-100",
    title: "text-emerald-950",
    body: "text-emerald-900",
    dismiss: "text-emerald-800 hover:bg-emerald-100",
  },
  error: {
    container: "border-red-200 bg-red-50 ring-red-100",
    title: "text-red-950",
    body: "text-red-900",
    dismiss: "text-red-800 hover:bg-red-100",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const baseId = useId();

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = `${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { ...toast, id }]);
    },
    [baseId],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: () => void;
}) {
  const variant = toast.variant ?? "success";
  const styles = variantStyles[variant];
  const body = toast.body?.trim() ?? "";

  useEffect(() => {
    if (variant === "error" && toast.durationMs === undefined) {
      return;
    }

    const timeout = window.setTimeout(
      onDismiss,
      toast.durationMs ?? DEFAULT_SUCCESS_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.durationMs, variant]);

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto w-full max-w-sm rounded-xl border p-4 shadow-lg ring-1 ${styles.container}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold ${styles.title}`}>{toast.title}</p>
          {body ? <p className={`mt-1 text-sm ${styles.body}`}>{body}</p> : null}
          {toast.action ? (
            <Link
              href={toast.action.href}
              className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {toast.action.label}
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          className={`shrink-0 rounded-lg p-1 ${styles.dismiss}`}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
