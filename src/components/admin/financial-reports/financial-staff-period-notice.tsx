"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendStaffLunchPeriodFinalizedNoticeAction } from "@/app/admin/financials/actions";
import type { StaffPeriodFinalizedNoticeSummary } from "@/lib/staff-period-notice-server";
import {
  canSendStaffPeriodFinalizedNotice,
  staffPeriodNoticeDisabledMessage,
  staffPeriodNoticeStatusLabel,
} from "@/lib/staff-period-notice-presentation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  periodId: string;
  periodLabel: string;
  summary: StaffPeriodFinalizedNoticeSummary;
  canMutate: boolean;
  supportReadOnly: boolean;
  showPostFinalizePrompt: boolean;
  noticeError?: string | null;
  noticeQueued?: boolean;
};

export function FinancialStaffPeriodNoticeSection({
  periodId,
  periodLabel,
  summary,
  canMutate,
  supportReadOnly,
  showPostFinalizePrompt,
  noticeError,
  noticeQueued,
}: Props) {
  const router = useRouter();
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const promptOpen = showPostFinalizePrompt && !promptDismissed;

  const disabledMessage = staffPeriodNoticeDisabledMessage(summary);
  const canSend = canSendStaffPeriodFinalizedNotice(summary, {
    supportReadOnly,
    canMutate,
  });

  function clearPromptParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("promptStaffNotice");
    url.searchParams.delete("finalized");
    router.replace(url.pathname + url.search);
  }

  function handleSend() {
    const message = `Send finalized-period notice to all active lunch participants (${summary.eligibleRecipientCount})?`;
    if (!window.confirm(message)) {
      return;
    }

    startTransition(async () => {
      await sendStaffLunchPeriodFinalizedNoticeAction(periodId);
    });
  }

  function handlePromptSendNow() {
    setPromptDismissed(true);
    clearPromptParams();
    handleSend();
  }

  function handlePromptNotNow() {
    setPromptDismissed(true);
    clearPromptParams();
  }

  return (
    <>
      {promptOpen && canMutate && !supportReadOnly ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-labelledby="staff-notice-prompt-title"
        >
          <Card padding="md" className="max-w-md shadow-lg">
            <h2 id="staff-notice-prompt-title" className="text-lg font-semibold text-slate-900">
              Notify staff?
            </h2>
            <p className="mt-2 text-sm text-muted">
              <strong>{periodLabel}</strong> is finalized. Send a notice to staff that this lunch
              period has been finalized?
            </p>
            {!summary.globallyEnabled ? (
              <Alert variant="warning" className="mt-4 text-sm">
                {disabledMessage}
              </Alert>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={handlePromptNotNow}>
                Not now
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!summary.globallyEnabled || isPending}
                onClick={handlePromptSendNow}
              >
                Send now
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Card padding="md" className="shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Staff period notice</h3>
            <p className="mt-1 text-sm text-muted">
              Optional email to active lunch participants after finalization.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {staffPeriodNoticeStatusLabel(summary)}
            </p>
            {summary.status === "partial_failure" || summary.status === "failed" ? (
              <p className="mt-1 text-sm text-muted">
                Some recipients did not receive the notice. Admin can review Email Delivery for
                technical details. Retry sends only to failed recipients.
              </p>
            ) : null}
            {disabledMessage ? (
              <Alert variant="warning" className="mt-3 text-sm">
                {disabledMessage}
              </Alert>
            ) : null}
            {noticeError ? (
              <Alert variant="error" className="mt-3 text-sm">
                Unable to queue the staff notice. The period remains finalized.
              </Alert>
            ) : null}
            {noticeQueued ? (
              <Alert variant="success" className="mt-3 text-sm">
                Staff notice queued for delivery.
              </Alert>
            ) : null}
          </div>
          {canSend ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={isPending}
              onClick={handleSend}
            >
              {summary.status === "not_sent" ? "Send staff notice" : "Retry failed notices"}
            </Button>
          ) : null}
        </div>
      </Card>
    </>
  );
}
