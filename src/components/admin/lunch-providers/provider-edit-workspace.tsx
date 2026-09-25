"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  PROVIDER_SUCCESS_TOAST_DURATION_MS,
  providerEditFlashToastTitle,
  type ProviderEditFlashSuccess,
} from "@/lib/provider-form";

type FlashProps = {
  flashSuccess?: ProviderEditFlashSuccess;
};

function ProviderEditFlashToasts({ flashSuccess }: FlashProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!flashSuccess || handled.current) {
      return;
    }

    handled.current = true;
    showToast({
      title: providerEditFlashToastTitle(flashSuccess),
      durationMs: PROVIDER_SUCCESS_TOAST_DURATION_MS,
    });
    router.replace(pathname, { scroll: false });
  }, [flashSuccess, pathname, router, showToast]);

  return null;
}

export function ProviderEditWorkspace({
  children,
  flashSuccess,
}: FlashProps & { children: ReactNode }) {
  return (
    <ToastProvider>
      <ProviderEditFlashToasts flashSuccess={flashSuccess} />
      {children}
    </ToastProvider>
  );
}
