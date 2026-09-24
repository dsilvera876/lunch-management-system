"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  canManageOpenIssue,
  canReportIssue,
  getDeliveryIssueLabel,
  getDeliveryResolutionLabel,
  getNewIssueReportPrimaryActionLabel,
  isImmediateNoChargeResolution,
} from "@/lib/delivery-reconciliation";
import { buildDeliveryRowDisplay } from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import type { DeliveryMutationResult } from "@/app/admin/deliveries/mutations";
import {
  confirmOrderDeliveryResolvedMutation,
  reportAndResolveOrderDeliveryNoChargeMutation,
  reportOrderDeliveryIssueMutation,
  resolveOrderNoChargeMutation,
  updateOrderDeliveryResolutionMutation,
  updateOrderHrDeliveryNotesMutation,
} from "@/app/admin/deliveries/mutations";
import { Button } from "@/components/ui/button";
import { selectClassName, textareaClassName } from "@/components/ui/form-field";

type Props = {
  order: OperationalOrder | null;
  open: boolean;
  onClose: () => void;
  onMutated: (result: DeliveryMutationResult) => boolean;
};

function OrderSummary({ order }: { order: OperationalOrder }) {
  const display = buildDeliveryRowDisplay(order);

  if (display.displayMode === "inline" && display.summaryText) {
    return (
      <p className="text-sm text-foreground">
        {display.summaryText}
        {display.quantityLines[0] ? ` ×${display.quantityLines[0]}` : ""}
      </p>
    );
  }

  return (
    <ul className="space-y-0.5 text-sm text-foreground">
      {display.summaryLines.map((line, index) => (
        <li key={`${line}-${index}`}>
          {line}
          {display.quantityLines[index] ? ` ×${display.quantityLines[index]}` : ""}
        </li>
      ))}
    </ul>
  );
}

async function saveOpenIssueDetails(input: {
  orderId: string;
  resolutionType: string;
  hrNotes: string;
}): Promise<DeliveryMutationResult> {
  if (input.resolutionType.trim()) {
    return updateOrderDeliveryResolutionMutation({
      orderId: input.orderId,
      resolutionType: input.resolutionType,
      hrNotes: input.hrNotes,
    });
  }

  return updateOrderHrDeliveryNotesMutation({
    orderId: input.orderId,
    hrNotes: input.hrNotes,
  });
}

export function DeliveryIssuePanelForm({
  order,
  onClose,
  onMutated,
  embedded = false,
}: {
  order: OperationalOrder;
  onClose: () => void;
  onMutated: (result: DeliveryMutationResult) => boolean;
  embedded?: boolean;
}) {
  const [issueType, setIssueType] = useState(order.deliveryIssueType ?? "");
  const [resolutionType, setResolutionType] = useState(order.deliveryResolutionType ?? "");
  const [hrNotes, setHrNotes] = useState(order.hrDeliveryNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showReportForm = canReportIssue(order) && order.deliveryState !== "issue_open";
  const showIssueActions = canManageOpenIssue(order.deliveryState);
  const reportPrimaryLabel = getNewIssueReportPrimaryActionLabel(resolutionType);

  const runMutation = (task: () => Promise<DeliveryMutationResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.success) {
        setError(result.error);
        return;
      }

      onMutated(result);
    });
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!embedded ? (
        <div className="space-y-2 rounded-lg bg-muted/25 px-3 py-2.5 ring-1 ring-inset ring-border/70">
          <p className="text-sm">
            <span className="font-medium text-foreground">Provider</span>
            <span className="mt-0.5 block text-foreground">{order.providerName}</span>
          </p>
          <div className="text-sm">
            <span className="font-medium text-foreground">Order</span>
            <div className="mt-0.5">
              <OrderSummary order={order} />
            </div>
          </div>
          {order.specialInstructions?.trim() ? (
            <p className="rounded-md bg-background/80 px-2 py-1.5 text-sm text-foreground ring-1 ring-inset ring-border/60">
              <span className="font-medium">Staff note:</span> {order.specialInstructions}
            </p>
          ) : null}
        </div>
        ) : null}

        {showReportForm ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Issue type</span>
              <select
                value={issueType}
                onChange={(event) => setIssueType(event.target.value)}
                className={`${selectClassName} mt-1`}
              >
                <option value="">Select issue</option>
                {DELIVERY_ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryIssueLabel(type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">Resolution plan</span>
              <select
                value={resolutionType}
                onChange={(event) => setResolutionType(event.target.value)}
                className={`${selectClassName} mt-1`}
              >
                <option value="">Optional</option>
                {DELIVERY_RESOLUTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryResolutionLabel(type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">HR notes (optional)</span>
              <textarea
                value={hrNotes}
                onChange={(event) => setHrNotes(event.target.value)}
                rows={3}
                className={`${textareaClassName} mt-1`}
                placeholder="Optional internal note"
              />
            </label>
          </div>
        ) : null}

        {showIssueActions ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Issue details
            </p>

            {order.deliveryIssueType ? (
              <div className="text-sm">
                <span className="font-medium text-foreground">Issue</span>
                <p className="mt-0.5 text-foreground">
                  {getDeliveryIssueLabel(order.deliveryIssueType)}
                </p>
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="font-medium">Resolution plan</span>
              <select
                value={resolutionType}
                onChange={(event) => setResolutionType(event.target.value)}
                className={`${selectClassName} mt-1`}
              >
                <option value="">Select resolution</option>
                {DELIVERY_RESOLUTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryResolutionLabel(type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">HR notes (optional)</span>
              <textarea
                value={hrNotes}
                onChange={(event) => setHrNotes(event.target.value)}
                rows={3}
                className={`${textareaClassName} mt-1`}
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="sticky bottom-0 space-y-3 border-t border-border bg-surface px-4 py-3">
        {showReportForm ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending || !issueType}
              onClick={() =>
                runMutation(() =>
                  isImmediateNoChargeResolution(resolutionType)
                    ? reportAndResolveOrderDeliveryNoChargeMutation({
                        orderId: order.id,
                        issueType,
                        resolutionType,
                        hrNotes,
                      })
                    : reportOrderDeliveryIssueMutation({
                        orderId: order.id,
                        issueType,
                        resolutionType: resolutionType || undefined,
                        hrNotes,
                      }),
                )
              }
            >
              {reportPrimaryLabel}
            </Button>
          </div>
        ) : null}

        {showIssueActions ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() =>
                  runMutation(() =>
                    saveOpenIssueDetails({
                      orderId: order.id,
                      resolutionType,
                      hrNotes,
                    }),
                  )
                }
              >
                Save changes
              </Button>
            </div>

            <div className="space-y-2 border-t border-border/80 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Resolution
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-w-[9.5rem] flex-1 sm:flex-none"
                  disabled={pending}
                  onClick={() =>
                    runMutation(() =>
                      confirmOrderDeliveryResolvedMutation({ orderId: order.id }),
                    )
                  }
                >
                  Confirm delivered
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-w-[9.5rem] flex-1 sm:flex-none"
                  disabled={pending}
                  onClick={() =>
                    runMutation(() =>
                      resolveOrderNoChargeMutation({ orderId: order.id, hrNotes }),
                    )
                  }
                >
                  Resolve no charge
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export function DeliveryIssuePanel({ order, open, onClose, onMutated }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !order) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <button
        type="button"
        aria-label="Close issue panel"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      <aside className="relative flex h-[min(92vh,100%)] w-full max-w-lg flex-col overflow-hidden border border-border bg-surface shadow-xl sm:rounded-l-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Delivery issue</h2>
            <p className="text-sm text-muted">{order.employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/40"
          >
            Close
          </button>
        </div>

        <DeliveryIssuePanelForm
          key={order.id}
          order={order}
          onClose={onClose}
          onMutated={onMutated}
        />
      </aside>
    </div>
  );
}
