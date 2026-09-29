"use client";

import { useState } from "react";
import { startSupportSessionAction } from "@/app/admin/support/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActiveSupportSession, SupportScope } from "@/lib/support-mode";
import { supportScopeLabel } from "@/lib/support-mode";
import { SupportModeExpiryDisplay } from "@/components/app-shell/support-mode-expiry-display";
import { SupportModeExitButton } from "@/components/app-shell/support-mode-exit-button";
import { endSupportSessionAction } from "@/app/admin/support/actions";

type Props = {
  activeSession: ActiveSupportSession | null;
};

export function SupportModeWorkspace({ activeSession }: Props) {
  const [pendingScope, setPendingScope] = useState<SupportScope | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  function openDialog(scope: SupportScope) {
    setPendingScope(scope);
    setReason("");
    setError(null);
  }

  function closeDialog() {
    setPendingScope(null);
    setReason("");
    setError(null);
  }

  async function submitStart() {
    if (!pendingScope || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await startSupportSessionAction(pendingScope, reason);
      if (result && !result.success) {
        setError(result.error);
        setSubmitting(false);
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

      console.error("[support-mode] unexpected start failure", caught);
      setError("Unable to start Support Mode. Try again.");
      setSubmitting(false);
    }
  }

  async function handleExitSupport() {
    setExitPending(true);
    setExitError(null);

    try {
      const result = await endSupportSessionAction();
      if (result && !result.success) {
        setExitError(result.error);
        setExitPending(false);
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
      setExitError("Unable to exit Support Mode. Try again.");
      setExitPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {activeSession ? (
        <Card
          padding="md"
          className="border-2 border-amber-400/60 border-t-4 border-t-amber-600 bg-amber-50/80 shadow-md ring-1 ring-amber-900/10 dark:border-amber-600/40 dark:border-t-amber-500 dark:bg-amber-950/30 dark:ring-amber-200/10"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-amber-950 dark:text-amber-50">
                Active: {supportScopeLabel(activeSession.scope)} Support
              </h2>
              <p className="mt-1 text-sm text-amber-900/85 dark:text-amber-100/85">
                Read-only troubleshooting access
              </p>
              <SupportModeExpiryDisplay
                scopeLabel={supportScopeLabel(activeSession.scope)}
                expiresAt={activeSession.expiresAt}
                variant="card"
              />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/70">
                Reason
              </p>
              <p className="mt-1 text-sm text-foreground">{activeSession.reason}</p>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
              {exitError ? (
                <p className="text-xs text-red-700 dark:text-red-200">{exitError}</p>
              ) : null}
              <SupportModeExitButton pending={exitPending} onClick={() => void handleExitSupport()} />
            </div>
          </div>
        </Card>
      ) : null}

      <Card padding="md">
        <h2 className="text-lg font-semibold text-foreground">Support Mode</h2>
        <p className="mt-1 text-sm text-muted">
          Temporarily view HR or Accounts areas for troubleshooting. Access is read-only, lasts 30
          minutes, and is audited.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openDialog("hr")}
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <p className="font-semibold text-foreground">HR Support</p>
            <p className="mt-1 text-sm text-muted">View HR tools and operational information.</p>
          </button>
          <button
            type="button"
            onClick={() => openDialog("accounts")}
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <p className="font-semibold text-foreground">Accounts Support</p>
            <p className="mt-1 text-sm text-muted">
              View financial, period, and Employee ID information.
            </p>
          </button>
        </div>
      </Card>

      {pendingScope ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-mode-dialog-title"
        >
          <Card padding="md" className="w-full max-w-md">
            <h3 id="support-mode-dialog-title" className="text-base font-semibold text-foreground">
              Start {supportScopeLabel(pendingScope)} Support
            </h3>
            <p className="mt-1 text-sm text-muted">Provide a ticket, issue, or brief reason.</p>
            <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="support-reason">
              Reason for support access
            </label>
            <textarea
              id="support-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ticket, issue, or brief troubleshooting reason"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDialog} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" onClick={submitStart} disabled={submitting || !reason.trim()}>
                Start Support Mode
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
