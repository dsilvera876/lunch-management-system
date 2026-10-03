"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgePrimaryDispatchNotReceivedAction,
  acknowledgePrimaryDispatchReceivedAction,
  sendProviderPrimaryOrderAction,
} from "@/app/admin/todays-orders/actions";
import { useSupportMode } from "@/components/app-shell/support-mode-context";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import {
  buildProviderPrimaryEmailStatusLabel,
  canHrResendPrimaryProviderEmail,
  canHrSendPrimaryProviderEmail,
  PRIMARY_PROVIDER_RESEND_CONFIRMATION,
  type ProviderPrimaryDispatchStatusRow,
} from "@/lib/provider-primary-order-presentation";

type Props = {
  providerId: string;
  deliveryDate: string;
  status: ProviderPrimaryDispatchStatusRow | null;
};

export function TodaysProviderPrimaryEmailControls({
  providerId,
  deliveryDate,
  status,
}: Props) {
  const router = useRouter();
  const { readOnly } = useSupportMode();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!status) {
    return null;
  }

  const statusLabel = buildProviderPrimaryEmailStatusLabel(status);
  const canSend = canHrSendPrimaryProviderEmail(status);
  const canResend = canHrResendPrimaryProviderEmail(status);
  const attentionDispatchId =
    status.latestStatus === "attention_required" ? status.latestDispatchId : null;

  function runSend(resendOfDispatchId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await sendProviderPrimaryOrderAction({
        providerId,
        deliveryDate,
        resendOfDispatchId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleSend() {
    if (!window.confirm("Send this provider their normal daily order email now?")) {
      return;
    }
    runSend(null);
  }

  function handleResend() {
    if (!status) {
      return;
    }
    if (!window.confirm(PRIMARY_PROVIDER_RESEND_CONFIRMATION)) {
      return;
    }
    if (!status.latestDispatchId) {
      setError("Unable to determine prior dispatch for resend.");
      return;
    }
    runSend(status.latestDispatchId);
  }

  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-slate-50/60 px-3 py-2.5 text-sm">
      <p className="font-medium text-slate-900">Provider order email</p>
      <p className="mt-0.5 text-muted">{statusLabel}</p>
      {status.errorSummary && status.latestStatus === "failed" ? (
        <p className="mt-1 text-amber-800">{status.errorSummary}</p>
      ) : null}

      {error ? (
        <FormActionStatus variant="error" className="mt-2 text-xs">
          {error}
        </FormActionStatus>
      ) : null}

      {readOnly ? null : (
        <div className="mt-2 flex flex-wrap gap-2">
          {canSend ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={handleSend}>
              Send provider email
            </Button>
          ) : null}
          {canResend ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={handleResend}>
              Resend provider email
            </Button>
          ) : null}
          {attentionDispatchId ? (
            <>
              <p className="w-full text-xs text-amber-700">
                Confirm with the provider before retrying — resending may duplicate kitchen preparation.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await acknowledgePrimaryDispatchNotReceivedAction({
                      dispatchId: attentionDispatchId,
                    });
                    if (!result.success) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                Confirm not received — allow retry
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await acknowledgePrimaryDispatchReceivedAction({
                      dispatchId: attentionDispatchId,
                    });
                    if (!result.success) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                Confirm provider received email
              </Button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
