"use client";

import { useState } from "react";
import { endSupportSessionAction } from "@/app/admin/support/actions";
import { supportScopeLabel } from "@/lib/support-mode";
import { useSupportMode } from "@/components/app-shell/support-mode-context";
import { SupportModeExpiryDisplay } from "@/components/app-shell/support-mode-expiry-display";
import { SupportModeExitButton } from "@/components/app-shell/support-mode-exit-button";

export function SupportModeBanner() {
  const { session, readOnly } = useSupportMode();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session || !readOnly) {
    return null;
  }

  const scopeLabel = supportScopeLabel(session.scope);

  async function handleExit() {
    setPending(true);
    setError(null);

    try {
      const result = await endSupportSessionAction();
      if (result && !result.success) {
        setError(result.error);
        setPending(false);
      }
    } catch (caught) {
      if (
        caught &&
        typeof caught === "object" &&
        "digest" in caught &&
        typeof (caught as { digest?: string }).digest === "string" &&
        (caught as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        return;
      }
      setError("Unable to exit Support Mode. Try again.");
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-700/40 bg-amber-100 px-4 py-2.5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/80 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5 sm:flex-1">
          <p className="text-sm font-semibold leading-snug">
            Support Mode: {scopeLabel}
          </p>
          <p className="text-xs leading-snug text-amber-950/85 dark:text-amber-50/85">
            Read-only troubleshooting access is active.
          </p>
        </div>

        <SupportModeExpiryDisplay
          scopeLabel={scopeLabel}
          expiresAt={session.expiresAt}
          variant="banner"
        />

        <div className="flex flex-col items-stretch gap-1 sm:shrink-0 sm:items-end">
          {error ? <p className="text-xs text-red-800 dark:text-red-200">{error}</p> : null}
          <SupportModeExitButton pending={pending} onClick={() => void handleExit()} />
        </div>
      </div>
    </div>
  );
}
