"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { linkButtonClass } from "@/components/ui/button";

export function NotificationDeliveryRefreshButton() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={linkButtonClass("secondary")}
      disabled={isRefreshing}
      aria-busy={isRefreshing}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isRefreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}
