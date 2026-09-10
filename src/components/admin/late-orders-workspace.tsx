"use client";

import { useState, useTransition } from "react";
import {
  acknowledgeDispatchNotReceivedAction,
  acknowledgeDispatchReceivedAction,
  createHrLateOrderAction,
  sendProviderLateOrderSupplementAction,
} from "@/app/admin/late-orders/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { selectClassName } from "@/components/ui/form-field";
import { canSendOutstandingSupplement } from "@/lib/late-orders";

type ProviderSummary = {
  providerId: string;
  providerName: string;
  deliveryDate: string;
  orderDate: string;
  acceptsLateOrders: boolean;
  deadlineLabel: string;
  lateOrderingOpen: boolean;
  approvedUnsentCount: number;
  dispatchMode: string;
  automaticScheduleLabel: string | null;
  supplementStatusLabel: string;
  snapshotMissing: boolean;
  hasBlockingDispatch: boolean;
  attentionDispatchId: string | null;
  primaryOrderEmail: string | null;
  lateOrders: Array<{
    id: string;
    employeeName: string;
    createdAt: string;
    dispatched: boolean;
  }>;
};

type Props = {
  providerSummaries: ProviderSummary[];
  employees: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  defaultDeliveryDate: string;
};

export function LateOrdersWorkspace({
  providerSummaries,
  employees,
  locations,
  defaultDeliveryDate,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSend = (providerId: string, deliveryDate: string) => {
    setToast(null);
    startTransition(async () => {
      const result = await sendProviderLateOrderSupplementAction({
        providerId,
        deliveryDate,
      });
      setToast(result.success ? "Supplemental email sent." : result.error);
    });
  };

  const handleAcknowledgeNotReceived = (dispatchId: string) => {
    const confirmed = window.confirm(
      "Confirm the provider did NOT receive this supplemental email. Retrying may send a duplicate supplemental email. Confirm with the provider before retrying.",
    );

    if (!confirmed) {
      return;
    }

    setToast(null);
    startTransition(async () => {
      const result = await acknowledgeDispatchNotReceivedAction({ dispatchId });
      setToast(result.success ? "Review recorded. Manual retry is now available." : result.error);
    });
  };

  const handleAcknowledgeReceived = (dispatchId: string) => {
    const confirmed = window.confirm(
      "Confirm the provider DID receive this supplemental email. This will mark the dispatch as sent without sending another email.",
    );

    if (!confirmed) {
      return;
    }

    setToast(null);
    startTransition(async () => {
      const result = await acknowledgeDispatchReceivedAction({ dispatchId });
      setToast(result.success ? "Dispatch marked as received without resending." : result.error);
    });
  };

  if (providerSummaries.length === 0) {
    return (
      <EmptyState
        title="No late-order activity"
        description="Enable late orders on a provider to create HR exceptions here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {toast ? <p className="text-sm text-muted">{toast}</p> : null}

      {providerSummaries.map((summary) => {
        const canSend = canSendOutstandingSupplement({
          approvedUnsentCount: summary.approvedUnsentCount,
          primaryOrderEmail: summary.primaryOrderEmail,
          lateOrderingOpen: summary.lateOrderingOpen,
          hasBlockingDispatch: summary.hasBlockingDispatch,
        });

        return (
          <section key={`${summary.providerId}-${summary.deliveryDate}`} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {summary.providerName} — delivery {summary.deliveryDate}
                </h2>
                <p className="text-sm text-muted">Order date {summary.orderDate}</p>
                <p className="text-sm text-muted">Late deadline: {summary.deadlineLabel}</p>
                <p className="text-sm text-muted">
                  Late ordering: {summary.lateOrderingOpen ? "Open" : "Closed"}
                </p>
                {summary.dispatchMode === "manual" ? (
                  <p className="text-sm text-muted">Manual supplemental sending</p>
                ) : null}
                {summary.automaticScheduleLabel ? (
                  <p className="text-sm text-muted">{summary.automaticScheduleLabel}</p>
                ) : null}
                <p className="text-sm font-medium text-foreground">{summary.supplementStatusLabel}</p>
                {summary.snapshotMissing ? (
                  <p className="text-sm text-amber-700">
                    Current-cycle menu snapshot is missing. Late ordering may fail until snapshots are materialized.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 text-right">
                <p className="text-sm font-medium text-foreground">
                  {summary.approvedUnsentCount} approved late order
                  {summary.approvedUnsentCount === 1 ? "" : "s"} not sent
                </p>
                {canSend ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => handleSend(summary.providerId, summary.deliveryDate)}
                    >
                      Send outstanding supplement now
                    </Button>
                    {summary.dispatchMode === "automatic" ? (
                      <p className="text-xs text-muted">Manual send available until provider deadline</p>
                    ) : null}
                  </>
                ) : null}
                {summary.attentionDispatchId ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700">
                      Retrying may send a duplicate supplemental email. Confirm with the provider before retrying.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => handleAcknowledgeNotReceived(summary.attentionDispatchId!)}
                    >
                      Confirm email was not received and allow retry
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => handleAcknowledgeReceived(summary.attentionDispatchId!)}
                    >
                      Confirm provider received email
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {summary.lateOrders.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {summary.lateOrders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{order.employeeName}</span>
                    <span className="text-muted">{new Date(order.createdAt).toLocaleString()}</span>
                    <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted">
                      {order.dispatched ? "Sent" : "Approved — Not Sent"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Create late order
        </summary>
        <LateOrderCreateForm
          employees={employees}
          locations={locations}
          providers={providerSummaries}
          defaultDeliveryDate={defaultDeliveryDate}
          onCreated={(message) => setToast(message)}
        />
      </details>
    </div>
  );
}

function LateOrderCreateForm({
  employees,
  locations,
  providers,
  defaultDeliveryDate,
  onCreated,
}: {
  employees: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  providers: ProviderSummary[];
  defaultDeliveryDate: string;
  onCreated: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  const providerOptions = Array.from(
    new Map(providers.map((summary) => [summary.providerId, summary.providerName])).entries(),
  );

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const itemsRaw = form.get("items");

        let items: unknown = [];

        try {
          items = JSON.parse(String(itemsRaw ?? "[]"));
        } catch {
          onCreated("Items payload must be valid JSON.");
          return;
        }

        startTransition(async () => {
          const result = await createHrLateOrderAction({
            profileId: String(form.get("profileId") ?? ""),
            providerId: String(form.get("providerId") ?? ""),
            deliveryDate: String(form.get("deliveryDate") ?? defaultDeliveryDate),
            officeLocationId: String(form.get("officeLocationId") ?? ""),
            specialInstructions: String(form.get("specialInstructions") ?? ""),
            items,
          });

          onCreated(result.success ? "Late order created." : result.error);
        });
      }}
    >
      <label className="text-xs text-muted">
        Employee
        <select name="profileId" required className={`${selectClassName} mt-0.5 block w-full text-sm`}>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-muted">
        Provider
        <select name="providerId" required className={`${selectClassName} mt-0.5 block w-full text-sm`}>
          {providerOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-muted">
        Scheduled delivery date
        <input
          name="deliveryDate"
          type="date"
          defaultValue={defaultDeliveryDate}
          required
          className={`${selectClassName} mt-0.5 block w-full text-sm`}
        />
      </label>

      <label className="text-xs text-muted">
        Office
        <select name="officeLocationId" required className={`${selectClassName} mt-0.5 block w-full text-sm`}>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-muted sm:col-span-2">
        Items JSON (snapshot menu_item_id payload)
        <textarea
          name="items"
          required
          defaultValue='{"standalone_items":[{"menu_item_id":"","quantity":1}]}'
          className={`${selectClassName} mt-0.5 block min-h-24 w-full text-sm`}
        />
      </label>

      <label className="text-xs text-muted sm:col-span-2">
        Special instructions
        <input name="specialInstructions" className={`${selectClassName} mt-0.5 block w-full text-sm`} />
      </label>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create late order"}
        </Button>
      </div>
    </form>
  );
}
