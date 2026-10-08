"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { declineStaffLateOrderRequestAction } from "@/app/admin/late-orders/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { formControlLabelClassName, inputClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import { useSupportMode } from "@/components/app-shell/support-mode-context";

export type PendingStaffLateOrderRequest = {
  id: string;
  requesterProfileId: string;
  requesterName: string;
  requesterEmail: string;
  providerId: string;
  providerName: string;
  scheduledDeliveryDate: string;
  requestedSummary: string;
  quantity: number;
  specialInstructions: string | null;
  officeLocationId: string;
  createdAt: string;
  fulfillmentWindowOpen: boolean;
};

type Props = {
  requests: PendingStaffLateOrderRequest[];
  onFulfill: (request: PendingStaffLateOrderRequest) => void;
};

export function PendingStaffLateOrderRequestsPanel({ requests, onFulfill }: Props) {
  const router = useRouter();
  const { readOnly } = useSupportMode();
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (requests.length === 0) {
    return null;
  }

  function handleDecline(requestId: string) {
    setError(null);
    startTransition(async () => {
      const result = await declineStaffLateOrderRequestAction({
        requestId,
        declineReason,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setDeclineId(null);
      setDeclineReason("");
      router.refresh();
    });
  }

  return (
    <Card padding="md" className="shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Pending staff requests</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {requests.length}
        </span>
      </div>

      {error ? (
        <FormActionStatus variant="error" className="mt-3">
          {error}
        </FormActionStatus>
      ) : null}

      <ul className="mt-4 space-y-3">
        {requests.map((request) => (
          <li
            key={request.id}
            className="rounded-lg border border-border bg-background px-3 py-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-foreground">
                  {request.requesterName}{" "}
                  <span className="font-normal text-muted">({request.requesterEmail})</span>
                </p>
                <p>
                  {request.providerName} · {formatHumanDate(request.scheduledDeliveryDate)}
                </p>
                <p>
                  Qty {request.quantity}: {request.requestedSummary}
                </p>
                {request.specialInstructions ? (
                  <p className="text-muted">Notes: {request.specialInstructions}</p>
                ) : null}
                <p className="text-xs text-muted">
                  Submitted {formatHumanDate(request.createdAt.slice(0, 10))}
                </p>
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {request.fulfillmentWindowOpen ? (
                    <Button type="button" variant="primary" onClick={() => onFulfill(request)}>
                      Fulfill
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDeclineId(request.id);
                      setDeclineReason("");
                    }}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
            </div>

            {declineId === request.id && !readOnly ? (
              <div className="mt-3 border-t border-border pt-3">
                <label className={formControlLabelClassName}>
                  Decline reason (visible to employee)
                  <textarea
                    className={inputClassName}
                    rows={2}
                    maxLength={500}
                    required
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="primary" onClick={() => handleDecline(request.id)}>
                    Confirm decline
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDeclineId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
