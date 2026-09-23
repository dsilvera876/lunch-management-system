"use client";

import { Button } from "@/components/ui/button";
import { formatHumanDate } from "@/lib/format";
import { buildLateOrderProviderStatusDisplay } from "@/lib/late-orders-presentation";
import { canSendOutstandingSupplement } from "@/lib/late-orders";

type ProviderSummary = {
  providerId: string;
  providerName: string;
  deliveryDate: string;
  orderDate: string;
  acceptsLateOrders: boolean;
  deadlineSummary: string;
  lateOrderingOpen: boolean;
  approvedUnsentCount: number;
  dispatchMode: string;
  automaticScheduleLabel: string | null;
  supplementStatusLabel: string;
  snapshotMissing: boolean;
  snapshotWarningMessage: string | null;
  hasBlockingDispatch: boolean;
  attentionDispatchId: string | null;
  primaryOrderEmail: string | null;
  cutoffTimeLabel: string;
};

type Props = {
  summary: ProviderSummary;
  pending: boolean;
  onSend: (providerId: string, deliveryDate: string) => void;
  onAcknowledgeNotReceived: (dispatchId: string) => void;
  onAcknowledgeReceived: (dispatchId: string) => void;
};

export function LateOrderProviderStatusCard({
  summary,
  pending,
  onSend,
  onAcknowledgeNotReceived,
  onAcknowledgeReceived,
}: Props) {
  const display = buildLateOrderProviderStatusDisplay({
    providerName: summary.providerName,
    deliveryDateLabel: formatHumanDate(summary.deliveryDate),
    lateOrderingOpen: summary.lateOrderingOpen,
    acceptsLateOrders: summary.acceptsLateOrders,
    cutoffLabel: summary.cutoffTimeLabel,
    dispatchMode: summary.dispatchMode,
    automaticScheduleLabel: summary.automaticScheduleLabel,
    approvedUnsentCount: summary.approvedUnsentCount,
    supplementStatusLabel: summary.supplementStatusLabel,
    snapshotWarningMessage: summary.snapshotWarningMessage,
    deadlineSummary: summary.deadlineSummary,
  });

  const canSend = canSendOutstandingSupplement({
    approvedUnsentCount: summary.approvedUnsentCount,
    primaryOrderEmail: summary.primaryOrderEmail,
    lateOrderingOpen: summary.lateOrderingOpen,
    hasBlockingDispatch: summary.hasBlockingDispatch,
  });

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{display.providerName}</h3>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                display.lateOrderingOpen
                  ? "bg-teal-50 text-teal-800 ring-teal-200"
                  : "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              {display.lateOrderingOpen ? "Late orders open" : "Late orders closed"}
            </span>
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">Delivery:</dt>
              <dd className="font-medium text-slate-900">{display.deliveryDateLabel}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">Cutoff:</dt>
              <dd className="text-slate-900">{display.cutoffLabel}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">Supplemental email:</dt>
              <dd className="text-slate-900">{display.supplementEmailMode}</dd>
            </div>
            {display.automaticScheduleLabel ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Schedule:</dt>
                <dd className="text-slate-900">{display.automaticScheduleLabel}</dd>
              </div>
            ) : null}
          </dl>

          {display.waitingApprovedLine ? (
            <p className="mt-2 text-sm font-semibold text-slate-900">{display.waitingApprovedLine}</p>
          ) : null}

          {display.closedReason && !display.lateOrderingOpen ? (
            <p className="mt-2 text-sm text-muted">{display.closedReason}</p>
          ) : null}

          {display.snapshotWarningMessage ? (
            <p className="mt-2 text-sm text-amber-800">{display.snapshotWarningMessage}</p>
          ) : null}

          {display.supplementStatusDetail ? (
            <p className="mt-2 text-sm text-muted">{display.supplementStatusDetail}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {canSend ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onSend(summary.providerId, summary.deliveryDate)}
            >
              Send outstanding supplement now
            </Button>
          ) : null}
          {summary.attentionDispatchId ? (
            <div className="space-y-2 text-left sm:text-right">
              <p className="text-xs text-amber-700">
                Retrying may send a duplicate supplemental email. Confirm with the provider before
                retrying.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onAcknowledgeNotReceived(summary.attentionDispatchId!)}
              >
                Confirm email was not received and allow retry
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onAcknowledgeReceived(summary.attentionDispatchId!)}
              >
                Confirm provider received email
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
