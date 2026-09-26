"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  ORDER_CUTOFF_SUCCESS_TOAST,
  ORDER_CUTOFF_SUCCESS_TOAST_DURATION_MS,
} from "@/lib/hr-settings-presentation";

type Props = {
  flashCutoffUpdated?: boolean;
  children: ReactNode;
};

function HrSettingsFlashToasts({ flashCutoffUpdated }: Pick<Props, "flashCutoffUpdated">) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!flashCutoffUpdated || handled.current) {
      return;
    }

    handled.current = true;
    showToast({
      title: ORDER_CUTOFF_SUCCESS_TOAST,
      durationMs: ORDER_CUTOFF_SUCCESS_TOAST_DURATION_MS,
    });
    router.replace(pathname, { scroll: false });
  }, [flashCutoffUpdated, pathname, router, showToast]);

  return null;
}

export function HrSettingsWorkspace({ flashCutoffUpdated, children }: Props) {
  return (
    <ToastProvider>
      <HrSettingsFlashToasts flashCutoffUpdated={flashCutoffUpdated} />
      {children}
    </ToastProvider>
  );
}
