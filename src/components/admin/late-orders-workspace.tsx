"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  acknowledgeDispatchNotReceivedAction,
  acknowledgeDispatchReceivedAction,
  createHrLateOrderFormAction,
  loadHrLateOrderSnapshotMenuAction,
  sendProviderLateOrderSupplementAction,
  type HrLateOrderSnapshotMenuItem,
} from "@/app/admin/late-orders/actions";
import { ProviderOrderForm } from "@/components/provider-order-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { selectClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import { canSendOutstandingSupplement } from "@/lib/late-orders";
import type { OfficeLocationOption } from "@/lib/office-locations";

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
  lateOrders: Array<{
    id: string;
    employeeName: string;
    createdAt: string;
    dispatched: boolean;
  }>;
};

type Props = {
  providerSummaries: ProviderSummary[];
  lateOrderProviders: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
  locations: OfficeLocationOption[];
  primaryDeliveryDate: string;
  jamaicaToday: string;
};

export function LateOrdersWorkspace({
  providerSummaries,
  lateOrderProviders,
  employees,
  locations,
  primaryDeliveryDate,
  jamaicaToday,
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

  const statusSummaries = useMemo(
    () =>
      [...providerSummaries].sort((a, b) => {
        if (a.deliveryDate !== b.deliveryDate) {
          return a.deliveryDate.localeCompare(b.deliveryDate);
        }

        return a.providerName.localeCompare(b.providerName);
      }),
    [providerSummaries],
  );

  return (
    <div className="space-y-6">
      {toast ? <p className="text-sm text-muted">{toast}</p> : null}

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold text-foreground">Create late order</h2>
        <p className="mt-1 text-sm text-muted">
          Use the frozen menu snapshot for the selected provider and delivery cycle.
        </p>
        <LateOrderCreatePanel
          key={primaryDeliveryDate}
          employees={employees}
          locations={locations}
          providers={lateOrderProviders}
          defaultDeliveryDate={primaryDeliveryDate}
          jamaicaToday={jamaicaToday}
          onCreated={(message) => setToast(message)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Provider status</h2>
        {statusSummaries.length === 0 ? (
          <EmptyState
            title="No actionable late-order cycles"
            description="When a provider late-order window opens or approved orders need sending, they will appear here."
          />
        ) : (
          statusSummaries.map((summary) => (
            <ProviderLateOrderStatusCard
              key={`${summary.providerId}-${summary.deliveryDate}`}
              summary={summary}
              pending={pending}
              onSend={handleSend}
              onAcknowledgeNotReceived={handleAcknowledgeNotReceived}
              onAcknowledgeReceived={handleAcknowledgeReceived}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ProviderLateOrderStatusCard({
  summary,
  pending,
  onSend,
  onAcknowledgeNotReceived,
  onAcknowledgeReceived,
}: {
  summary: ProviderSummary;
  pending: boolean;
  onSend: (providerId: string, deliveryDate: string) => void;
  onAcknowledgeNotReceived: (dispatchId: string) => void;
  onAcknowledgeReceived: (dispatchId: string) => void;
}) {
  const canSend = canSendOutstandingSupplement({
    approvedUnsentCount: summary.approvedUnsentCount,
    primaryOrderEmail: summary.primaryOrderEmail,
    lateOrderingOpen: summary.lateOrderingOpen,
    hasBlockingDispatch: summary.hasBlockingDispatch,
  });

  const dispatchModeLabel =
    summary.dispatchMode === "automatic" ? "Automatic supplemental sending" : "Manual supplemental sending";

  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{summary.providerName}</h3>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                summary.lateOrderingOpen
                  ? "bg-teal-50 text-teal-800 ring-teal-200"
                  : "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              {summary.lateOrderingOpen ? "Late orders open" : "Late orders closed"}
            </span>
          </div>
          <p className="text-sm text-foreground">
            Delivery: {formatHumanDate(summary.deliveryDate)}
          </p>
          <p className="text-sm text-muted">{summary.deadlineSummary}</p>
          <p className="text-sm text-muted">{dispatchModeLabel}</p>
          {summary.automaticScheduleLabel ? (
            <p className="text-sm text-muted">{summary.automaticScheduleLabel}</p>
          ) : null}
          <p className="text-sm font-medium text-foreground">
            {summary.approvedUnsentCount} approved late order
            {summary.approvedUnsentCount === 1 ? "" : "s"} waiting to send
          </p>
          <p className="text-sm text-muted">{summary.supplementStatusLabel}</p>
          {summary.snapshotWarningMessage ? (
            <p className="text-sm text-amber-800">{summary.snapshotWarningMessage}</p>
          ) : null}
        </div>

        <div className="space-y-2 text-right">
          {canSend ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onSend(summary.providerId, summary.deliveryDate)}
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

      {summary.lateOrders.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {summary.lateOrders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{order.employeeName}</span>
              <span className="text-muted">{new Date(order.createdAt).toLocaleString()}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  order.dispatched ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                }`}
              >
                {order.dispatched ? "Sent" : "Approved — not sent"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function LateOrderCreatePanel({
  employees,
  locations,
  providers,
  defaultDeliveryDate,
  jamaicaToday,
  onCreated,
}: {
  employees: Array<{ id: string; name: string }>;
  locations: OfficeLocationOption[];
  providers: Array<{ id: string; name: string }>;
  defaultDeliveryDate: string;
  jamaicaToday: string;
  onCreated: (message: string) => void;
}) {
  const [profileId, setProfileId] = useState(employees[0]?.id ?? "");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [deliveryDate, setDeliveryDate] = useState(defaultDeliveryDate);
  const [menuItems, setMenuItems] = useState<HrLateOrderSnapshotMenuItem[]>([]);
  const [orderDate, setOrderDate] = useState("");
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const providerName = providers.find((provider) => provider.id === providerId)?.name ?? "Provider";

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!providerId || !deliveryDate) {
        return;
      }

      setLoadingMenu(true);
      setMenuMessage(null);

      const result = await loadHrLateOrderSnapshotMenuAction({
        providerId,
        deliveryDate,
      });

      if (cancelled) {
        return;
      }

      setLoadingMenu(false);

      if (!result.success) {
        setMenuItems([]);
        setMenuStatus("error");
        setMenuMessage(result.error);
        return;
      }

      setMenuStatus(result.status);
      setOrderDate(result.orderDate);

      if (result.status === "available" && result.menuItems.length > 0) {
        setMenuItems(result.menuItems);
        setMenuMessage(null);
        setFormKey((value) => value + 1);
        return;
      }

      setMenuItems([]);

      if (result.status === "historical_unavailable") {
        setMenuMessage(
          "Late ordering is unavailable for this delivery date because the menu snapshot for that order cycle was not captured.",
        );
        return;
      }

      if (result.status === "future_unavailable") {
        setMenuMessage("Menu snapshot is not available for this cycle yet.");
        return;
      }

      if (result.status === "available" && result.menuItems.length === 0) {
        setMenuMessage("This snapshot has no active menu items.");
        return;
      }

      setMenuMessage("Unable to load menu for this provider and delivery date.");
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId, deliveryDate]);

  const creationDisabled =
    loadingMenu ||
    !providerId ||
    !profileId ||
    menuStatus !== "available" ||
    menuItems.length === 0;

  const handleFormAction = async (formData: FormData) => {
    formData.set("profileId", profileId);
    formData.set("deliveryDate", deliveryDate);

    const result = await createHrLateOrderFormAction(formData);
    onCreated(result.success ? "Late order created." : result.error);

    if (result.success) {
      setFormKey((value) => value + 1);
    }
  };

  if (providers.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No providers are configured to accept late orders.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Employee
          <select
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            className={`${selectClassName} mt-0.5 block w-full text-sm`}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Provider
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className={`${selectClassName} mt-0.5 block w-full text-sm`}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Scheduled delivery date
          <input
            type="date"
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
            className={`${selectClassName} mt-0.5 block w-full text-sm`}
          />
        </label>
      </div>

      {orderDate ? (
        <p className="text-xs text-muted">
          Order cycle date: {formatHumanDate(orderDate)}
          {orderDate === jamaicaToday ? " (current Jamaica order day)" : null}
        </p>
      ) : null}

      {loadingMenu ? (
        <p className="text-sm text-muted">Loading frozen menu snapshot…</p>
      ) : null}

      {menuMessage ? (
        <p className="text-sm text-amber-800" role="alert">
          {menuMessage}
        </p>
      ) : null}

      {!creationDisabled ? (
        <ProviderOrderForm
          key={formKey}
          providerId={providerId}
          providerName={providerName}
          orderDate={orderDate}
          deliveryDate={deliveryDate}
          menuItems={menuItems.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            itemType: item.itemType,
            unitLabel: item.unitLabel,
            displayCategory: item.displayCategory,
          }))}
          formAction={handleFormAction}
          mainFieldName="mainMenuItemId"
          quantityFieldPrefix="quantity"
          submitLabel="Create late order"
          pendingLabel="Creating late order…"
          officeLocations={locations}
        />
      ) : null}

      {creationDisabled && !loadingMenu && !menuMessage ? (
        <p className="text-sm text-muted">Choose a provider and delivery date to build a late order.</p>
      ) : null}
    </div>
  );
}
