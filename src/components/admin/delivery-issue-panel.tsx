"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  canManageOpenIssue,
  canReportIssue,
  getDeliveryIssueLabel,
  getDeliveryResolutionLabel,
} from "@/lib/delivery-reconciliation";
import { buildDeliveryRowDisplay } from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import type { DeliveryMutationResult } from "@/app/admin/deliveries/mutations";
import {
  confirmOrderDeliveryResolvedMutation,
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
  onMutated: (result: DeliveryMutationResult) => void;
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

function IssuePanelForm({
  order,
  onMutated,
}: {
  order: OperationalOrder;
  onMutated: (result: DeliveryMutationResult) => void;
}) {
  const [issueType, setIssueType] = useState(order.deliveryIssueType ?? "");
  const [resolutionType, setResolutionType] = useState(order.deliveryResolutionType ?? "");
  const [hrNotes, setHrNotes] = useState(order.hrDeliveryNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const showReportForm = canReportIssue(order) && order.deliveryState !== "issue_open";
  const showIssueActions = canManageOpenIssue(order.deliveryState);

  return (
    <div className="space-y-4 overflow-y-auto px-4 py-4">
      <div className="space-y-1 text-sm">
        <p className="text-muted">
          <span className="font-medium text-foreground">Provider:</span> {order.providerName}
        </p>
        <OrderSummary order={order} />
        {order.specialInstructions?.trim() && (
          <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-950">
            Staff note: {order.specialInstructions}
          </p>
        )}
      </div>

      {showReportForm && (
        <div className="space-y-3 border-t border-border pt-3">
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
            <span className="font-medium">HR notes</span>
            <textarea
              value={hrNotes}
              onChange={(event) => setHrNotes(event.target.value)}
              rows={3}
              className={`${textareaClassName} mt-1`}
              placeholder="Optional internal note"
            />
          </label>

          <Button
            type="button"
            variant="primary"
            disabled={pending || !issueType}
            onClick={() =>
              runMutation(() =>
                reportOrderDeliveryIssueMutation({
                  orderId: order.id,
                  issueType,
                  resolutionType: resolutionType || undefined,
                  hrNotes,
                }),
              )
            }
          >
            Report issue
          </Button>
        </div>
      )}

      {showIssueActions && (
        <div className="space-y-3 border-t border-border pt-3">
          {order.deliveryIssueType && (
            <p className="text-sm">
              <span className="font-medium">Issue:</span>{" "}
              {getDeliveryIssueLabel(order.deliveryIssueType)}
            </p>
          )}

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
            <span className="font-medium">HR notes</span>
            <textarea
              value={hrNotes}
              onChange={(event) => setHrNotes(event.target.value)}
              rows={3}
              className={`${textareaClassName} mt-1`}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !resolutionType}
              onClick={() =>
                runMutation(() =>
                  updateOrderDeliveryResolutionMutation({
                    orderId: order.id,
                    resolutionType,
                    hrNotes,
                  }),
                )
              }
            >
              Update resolution
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                runMutation(() =>
                  updateOrderHrDeliveryNotesMutation({
                    orderId: order.id,
                    hrNotes,
                  }),
                )
              }
            >
              Save notes
            </Button>

            <Button
              type="button"
              variant="primary"
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
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
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

      <aside className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden border border-border bg-surface shadow-xl sm:max-h-full sm:rounded-l-xl">
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

        <IssuePanelForm key={order.id} order={order} onMutated={onMutated} />
      </aside>
    </div>
  );
}
