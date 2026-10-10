"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  message?: string;
  compact?: boolean;
};

export function MenuItemRatingsLoadNotice({
  message = "Menu item ratings could not be loaded. Your orders and menus are still available.",
  compact = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className={
        compact
          ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      }
    >
      <p>{message}</p>
      <button
        type="button"
        className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-staff-teal underline-offset-2 hover:underline disabled:opacity-60"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {isPending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
