"use client";

import { useEffect, useState } from "react";
import { IconClock } from "@/components/icons/line-icons";
import {
  buildSupportExpiryAccessibleLabel,
  formatSupportExpiryCountdown,
  formatSupportExpiryJamaicaTime,
} from "@/lib/support-mode-expiry";

type Props = {
  scopeLabel: string;
  expiresAt: string;
  variant?: "banner" | "card";
};

export function SupportModeExpiryDisplay({
  scopeLabel,
  expiresAt,
  variant = "banner",
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => window.clearInterval(id);
  }, [expiresAt]);

  const countdown = formatSupportExpiryCountdown(expiresAt, nowMs);
  const exactTime = formatSupportExpiryJamaicaTime(expiresAt);
  const accessibleLabel = buildSupportExpiryAccessibleLabel({
    scopeLabel,
    expiresAtIso: expiresAt,
    nowMs,
  });

  if (variant === "card") {
    return (
      <p className="mt-2 text-sm text-amber-950/90 dark:text-amber-100/90">
        <span className="sr-only">{accessibleLabel}</span>
        <span aria-hidden="true" className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <IconClock size={15} className="shrink-0 opacity-80" aria-hidden />
          <span className="font-medium">{countdown}</span>
          {exactTime ? (
            <>
              <span className="text-amber-900/50 dark:text-amber-200/50">·</span>
              <span className="text-amber-900/80 dark:text-amber-100/80">{exactTime}</span>
            </>
          ) : null}
        </span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 sm:justify-end">
      <span className="sr-only">{accessibleLabel}</span>
      <div
        aria-hidden="true"
        className="flex min-w-0 items-center gap-2 rounded-md border border-amber-900/15 bg-amber-900/5 px-2.5 py-1.5 dark:border-amber-200/15 dark:bg-amber-950/40"
      >
        <IconClock size={16} className="shrink-0 text-amber-900/80 dark:text-amber-100/80" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
            Expires in
          </p>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            {countdown.replace(/^Expires in /, "")}
          </p>
          {exactTime ? (
            <p className="text-[11px] text-amber-900/75 dark:text-amber-100/75">at {exactTime}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
