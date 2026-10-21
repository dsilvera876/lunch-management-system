"use client";

import Link from "next/link";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleX,
  IconInfo,
  IconX,
} from "@/components/icons/line-icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastInput = {
  title: string;
  body?: string;
  variant?: ToastVariant;
  action?: { label: string; href: string };
  /**
   * Explicitly controls auto-dismiss timing. Without a value, success and info
   * toasts are timed while errors, warnings, and toasts with actions persist.
   */
  durationMs?: number;
};

export type ToastRecord = ToastInput & {
  id: string;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

export type ToastTimerPauseReason = "hover" | "focus" | "document-hidden";

export type ToastTimerRuntime = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type PausableToastTimer = {
  pause: (reason: ToastTimerPauseReason) => void;
  resume: (reason: ToastTimerPauseReason) => void;
  dispose: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const DEFAULT_TIMED_TOAST_DURATION_MS = 7000;

const variantStyles: Record<
  ToastVariant,
  { container: string; action: string; dismiss: string }
> = {
  success: {
    container: "border-emerald-800 bg-emerald-700",
    action: "text-emerald-800 hover:bg-emerald-50",
    dismiss: "hover:bg-white/15",
  },
  error: {
    container: "border-red-800 bg-red-700",
    action: "text-red-800 hover:bg-red-50",
    dismiss: "hover:bg-white/15",
  },
  warning: {
    container: "border-amber-800 bg-amber-700",
    action: "text-amber-800 hover:bg-amber-50",
    dismiss: "hover:bg-white/15",
  },
  info: {
    container: "border-blue-800 bg-blue-700",
    action: "text-blue-800 hover:bg-blue-50",
    dismiss: "hover:bg-white/15",
  },
};

export function resolveToastDurationMs(
  toast: Pick<ToastInput, "action" | "durationMs">,
  variant: ToastVariant,
): number | null {
  if (toast.durationMs !== undefined) {
    return Math.max(0, toast.durationMs);
  }
  if (toast.action || variant === "error" || variant === "warning") {
    return null;
  }
  return DEFAULT_TIMED_TOAST_DURATION_MS;
}

export function createPausableToastTimer({
  durationMs,
  onElapsed,
  runtime,
}: {
  durationMs: number;
  onElapsed: () => void;
  runtime?: ToastTimerRuntime;
}): PausableToastTimer {
  const timerRuntime: ToastTimerRuntime = runtime ?? {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
  const pauseReasons = new Set<ToastTimerPauseReason>();
  let remainingMs = Math.max(0, durationMs);
  let startedAt = timerRuntime.now();
  let timeout: unknown = null;
  let disposed = false;
  let elapsed = false;

  const schedule = () => {
    if (disposed || elapsed || pauseReasons.size > 0 || timeout !== null) {
      return;
    }
    startedAt = timerRuntime.now();
    timeout = timerRuntime.setTimeout(() => {
      timeout = null;
      if (disposed || elapsed || pauseReasons.size > 0) {
        return;
      }
      remainingMs = 0;
      elapsed = true;
      onElapsed();
    }, remainingMs);
  };

  schedule();

  return {
    pause(reason) {
      if (disposed || elapsed || pauseReasons.has(reason)) {
        return;
      }
      pauseReasons.add(reason);
      if (timeout !== null) {
        timerRuntime.clearTimeout(timeout);
        timeout = null;
        remainingMs = Math.max(0, remainingMs - (timerRuntime.now() - startedAt));
      }
    },
    resume(reason) {
      if (disposed || elapsed || !pauseReasons.delete(reason)) {
        return;
      }
      schedule();
    },
    dispose() {
      disposed = true;
      pauseReasons.clear();
      if (timeout !== null) {
        timerRuntime.clearTimeout(timeout);
        timeout = null;
      }
    },
  };
}

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
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastStatusIcon({ variant }: { variant: ToastVariant }) {
  const props = {
    size: 22,
    className: "mt-0.5 shrink-0",
    "data-toast-variant-icon": variant,
  };

  switch (variant) {
    case "error":
      return <IconCircleX {...props} />;
    case "warning":
      return <IconAlertTriangle {...props} />;
    case "info":
      return <IconInfo {...props} />;
    default:
      return <IconCheck {...props} />;
  }
}

export function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const variant = toast.variant ?? "success";
  const styles = variantStyles[variant];
  const body = toast.body?.trim() ?? "";
  const durationMs = resolveToastDurationMs(toast, variant);
  const timerRef = useRef<PausableToastTimer | null>(null);

  useEffect(() => {
    if (durationMs === null) {
      timerRef.current = null;
      return;
    }

    const timer = createPausableToastTimer({
      durationMs,
      onElapsed: () => onDismiss(toast.id),
    });
    timerRef.current = timer;

    const reconcileDocumentVisibility = () => {
      if (document.hidden) {
        timer.pause("document-hidden");
      } else {
        timer.resume("document-hidden");
      }
    };
    reconcileDocumentVisibility();
    document.addEventListener("visibilitychange", reconcileDocumentVisibility);

    return () => {
      document.removeEventListener("visibilitychange", reconcileDocumentVisibility);
      timer.dispose();
      if (timerRef.current === timer) {
        timerRef.current = null;
      }
    };
  }, [durationMs, onDismiss, toast.id]);

  const handleFocusLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      timerRef.current?.resume("focus");
    }
  };

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`pointer-events-auto w-full max-w-sm rounded-xl border p-4 text-white shadow-xl shadow-slate-950/25 ring-1 ring-black/15 ${styles.container}`}
      onMouseEnter={() => timerRef.current?.pause("hover")}
      onMouseLeave={() => timerRef.current?.resume("hover")}
      onFocusCapture={() => timerRef.current?.pause("focus")}
      onBlurCapture={handleFocusLeave}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ToastStatusIcon variant={variant} />
          <div className="min-w-0">
            <p className="font-semibold text-white">{toast.title}</p>
            {body ? <p className="mt-1 text-sm text-white">{body}</p> : null}
            {toast.action ? (
              <Link
                href={toast.action.href}
                className={`mt-3 inline-flex min-h-9 items-center rounded-lg border border-white bg-white px-3 py-1.5 text-sm font-semibold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${styles.action}`}
              >
                {toast.action.label}
              </Link>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Dismiss ${toast.title} notification`}
          className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${styles.dismiss}`}
          onClick={() => onDismiss(toast.id)}
        >
          <IconX size={20} />
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
