"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  acknowledgeDispatchNotReceivedAction,
  acknowledgeDispatchReceivedAction,
  createHrLateOrderFormAction,
  fulfillStaffLateOrderRequestAction,
  loadHrLateOrderSnapshotMenuAction,
  sendProviderLateOrderSupplementAction,
  type HrLateOrderSnapshotMenuItem,
} from "@/app/admin/late-orders/actions";
import {
  PendingStaffLateOrderRequestsPanel,
  type PendingStaffLateOrderRequest,
} from "@/components/admin/late-orders/pending-staff-late-order-requests";
import { EmployeePicker } from "@/components/employee-picker";
import { LateOrderProviderStatusCard } from "@/components/admin/late-orders/late-order-provider-status-card";
import { ProviderOrderForm } from "@/components/provider-order-form";
import {
  LateOrderSectionHeader,
  lateOrderMajorCardClassName,
} from "@/components/admin/late-orders/late-order-section-header";
import { IconClipboard, IconClock } from "@/components/icons/line-icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatFormActionError,
  FormActionStatus,
  type FormActionStatusVariant,
} from "@/components/ui/form-action-status";
import {
  formControlLabelClassName,
  selectClassName,
} from "@/components/ui/form-field";
import { ReadOnlyFormValue } from "@/components/ui/read-only-form-value";
import { formatHumanDate } from "@/lib/format";
import type { LateOrderRowDispatchDisplay } from "@/lib/late-order-per-order-status";
import type { HrLateOrderCreationCycle } from "@/lib/hr-late-order-create";
import type { OfficeLocationOption } from "@/lib/office-locations";
import { buildSnapshotOrderPayload } from "@/lib/order-payload";
import { LateOrdersUnavailableCard } from "@/components/admin/late-orders/late-orders-unavailable-card";
import {
  formatLateOrderCreateErrorMessage,
  hasActionableLateOrderCreationCycle,
  LATE_ORDER_CREATE_SUCCESS_TOAST_DURATION_MS,
  LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE,
  LATE_ORDER_CYCLE_DATE_LOADING_LABEL,
  lateOrderMenuUnavailableMessage,
  resolveLateOrderMenuPresentation,
  resolveLateOrdersUnavailableReason,
  shouldShowLateOrderFullWorkflow,
  shouldShowLateOrderProviderStatusSection,
} from "@/lib/late-orders-presentation";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useSupportMode } from "@/components/app-shell/support-mode-context";
import { SupportModeMutationHint } from "@/components/app-shell/support-mode-ui";

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
  lateOrders: Array<{
    id: string;
    employeeName: string;
    createdAt: string;
    dispatchDisplay: LateOrderRowDispatchDisplay;
  }>;
};

type Props = {
  providerSummaries: ProviderSummary[];
  lateOrderProviders: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; email: string }>;
  locations: OfficeLocationOption[];
  primaryDeliveryDate: string;
  jamaicaToday: string;
  providerCreationCycles: Record<string, HrLateOrderCreationCycle[]>;
  pendingStaffRequests: PendingStaffLateOrderRequest[];
};

type WorkspaceFeedback = {
  variant: FormActionStatusVariant;
  message: string;
} | null;

export function LateOrdersWorkspace(props: Props) {
  return (
    <ToastProvider>
      <LateOrdersWorkspaceInner {...props} />
    </ToastProvider>
  );
}

function LateOrdersWorkspaceInner({
  providerSummaries,
  lateOrderProviders,
  employees,
  locations,
  primaryDeliveryDate,
  jamaicaToday,
  providerCreationCycles,
  pendingStaffRequests = [],
}: Props) {
  const { readOnly } = useSupportMode();
  const router = useRouter();
  const [feedback, setFeedback] = useState<WorkspaceFeedback>(null);
  const [pending, startTransition] = useTransition();
  const [fulfillRequest, setFulfillRequest] = useState<PendingStaffLateOrderRequest | null>(
    null,
  );

  const handleSend = (providerId: string, deliveryDate: string) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await sendProviderLateOrderSupplementAction({
        providerId,
        deliveryDate,
      });

      if (result.success) {
        setFeedback({
          variant: "success",
          message: "Supplemental email sent successfully.",
        });
        router.refresh();
        return;
      }

      setFeedback({
        variant: "error",
        message: formatFormActionError("Unable to send supplemental email", result.error),
      });
    });
  };

  const handleAcknowledgeNotReceived = (dispatchId: string) => {
    const confirmed = window.confirm(
      "Confirm the provider did NOT receive this supplemental email. Retrying may send a duplicate supplemental email. Confirm with the provider before retrying.",
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await acknowledgeDispatchNotReceivedAction({ dispatchId });

      if (result.success) {
        setFeedback({
          variant: "success",
          message: "Review recorded. Manual retry is now available.",
        });
        router.refresh();
        return;
      }

      setFeedback({
        variant: "error",
        message: formatFormActionError("Unable to record dispatch review", result.error),
      });
    });
  };

  const handleAcknowledgeReceived = (dispatchId: string) => {
    const confirmed = window.confirm(
      "Confirm the provider DID receive this supplemental email. This will mark the dispatch as sent without sending another email.",
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await acknowledgeDispatchReceivedAction({ dispatchId });

      if (result.success) {
        setFeedback({
          variant: "success",
          message: "Dispatch marked as received without resending.",
        });
        router.refresh();
        return;
      }

      setFeedback({
        variant: "error",
        message: formatFormActionError("Unable to update dispatch status", result.error),
      });
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

  const lateOrderProviderIds = useMemo(
    () => lateOrderProviders.map((provider) => provider.id),
    [lateOrderProviders],
  );

  const hasActionableCreationCycle = useMemo(
    () => hasActionableLateOrderCreationCycle(lateOrderProviderIds, providerCreationCycles),
    [lateOrderProviderIds, providerCreationCycles],
  );

  const unavailableReason = resolveLateOrdersUnavailableReason({
    lateOrderProviderCount: lateOrderProviders.length,
    hasActionableCreationCycle,
    statusSummaryCount: statusSummaries.length,
  });

  const showFullWorkflow = shouldShowLateOrderFullWorkflow(hasActionableCreationCycle);
  const showProviderStatus = shouldShowLateOrderProviderStatusSection({
    unavailableReason,
    hasActionableCreationCycle,
    statusSummaryCount: statusSummaries.length,
  });

  return (
    <div className="space-y-6">
      {feedback ? (
        <FormActionStatus variant={feedback.variant}>{feedback.message}</FormActionStatus>
      ) : null}

      <PendingStaffLateOrderRequestsPanel
        requests={pendingStaffRequests}
        onFulfill={(request) => setFulfillRequest(request)}
      />

      {unavailableReason ? (
        <LateOrdersUnavailableCard reason={unavailableReason} />
      ) : (
        <>
          {showFullWorkflow && !readOnly ? (
            <LateOrderCreatePanel
              key={fulfillRequest?.id ?? "hr-late-create"}
              employees={employees}
              locations={locations}
              providers={lateOrderProviders}
              defaultDeliveryDate={primaryDeliveryDate}
              jamaicaToday={jamaicaToday}
              providerCreationCycles={providerCreationCycles}
              fulfillRequest={fulfillRequest}
              onCreateSuccess={() => {
                setFulfillRequest(null);
                router.refresh();
              }}
            />
          ) : null}

          {showProviderStatus ? (
            <Card padding="sm" className={lateOrderMajorCardClassName}>
              <LateOrderSectionHeader
                icon={<IconClock aria-hidden />}
                title={showFullWorkflow && !readOnly ? "3. Provider Status" : "Provider Status"}
                description="Current late-order availability for each provider."
              />
              {readOnly ? <SupportModeMutationHint className="mt-3" /> : null}
              {statusSummaries.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No actionable late-order cycles"
                    description="When a provider late-order window opens or approved orders need sending, they will appear here."
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {statusSummaries.map((summary) => (
                    <LateOrderProviderStatusCard
                      key={`${summary.providerId}-${summary.deliveryDate}`}
                      summary={summary}
                      pending={pending}
                      onSend={handleSend}
                      onAcknowledgeNotReceived={handleAcknowledgeNotReceived}
                      onAcknowledgeReceived={handleAcknowledgeReceived}
                    />
                  ))}
                </div>
              )}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function LateOrderCreatePanel({
  employees,
  locations,
  providers,
  defaultDeliveryDate,
  jamaicaToday,
  providerCreationCycles,
  fulfillRequest,
  onCreateSuccess,
}: {
  employees: Array<{ id: string; name: string; email: string }>;
  locations: OfficeLocationOption[];
  providers: Array<{ id: string; name: string }>;
  defaultDeliveryDate: string;
  jamaicaToday: string;
  providerCreationCycles: Record<string, HrLateOrderCreationCycle[]>;
  fulfillRequest: PendingStaffLateOrderRequest | null;
  onCreateSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [profileId, setProfileId] = useState(fulfillRequest?.requesterProfileId ?? "");
  const [providerId, setProviderId] = useState(
    fulfillRequest?.providerId ?? providers[0]?.id ?? "",
  );

  const actionableCycles = useMemo(
    () => providerCreationCycles[providerId] ?? [],
    [providerCreationCycles, providerId],
  );

  const [deliveryPickByProvider, setDeliveryPickByProvider] = useState<
    Record<string, string>
  >(() =>
    fulfillRequest
      ? { [fulfillRequest.providerId]: fulfillRequest.scheduledDeliveryDate }
      : {},
  );

  const deliveryDate = useMemo(() => {
    if (actionableCycles.length === 0) {
      return "";
    }

    const picked = deliveryPickByProvider[providerId];

    if (picked && actionableCycles.some((cycle) => cycle.deliveryDate === picked)) {
      return picked;
    }

    if (actionableCycles.some((cycle) => cycle.deliveryDate === defaultDeliveryDate)) {
      return defaultDeliveryDate;
    }

    return actionableCycles[0]?.deliveryDate ?? "";
  }, [actionableCycles, defaultDeliveryDate, deliveryPickByProvider, providerId]);
  const [menuItems, setMenuItems] = useState<HrLateOrderSnapshotMenuItem[]>([]);
  const [orderDate, setOrderDate] = useState("");
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const [menuLoadSucceeded, setMenuLoadSucceeded] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  /** Bumps menu-selection state inside ProviderOrderForm without remounting Order Details. */
  const [menuSelectionEpoch, setMenuSelectionEpoch] = useState(0);

  const providerName = providers.find((provider) => provider.id === providerId)?.name ?? "Provider";

  const noActionableCycles = actionableCycles.length === 0;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!providerId || !deliveryDate) {
        return;
      }

      setLoadingMenu(true);
      setMenuLoadSucceeded(false);
      setMenuItems([]);
      setMenuStatus(null);
      setMenuSelectionEpoch((value) => value + 1);

      const result = await loadHrLateOrderSnapshotMenuAction({
        providerId,
        deliveryDate,
        profileId: (fulfillRequest?.requesterProfileId ?? profileId) || undefined,
      });

      if (cancelled) {
        return;
      }

      setLoadingMenu(false);

      if (!result.success) {
        setMenuItems([]);
        setMenuStatus("error");
        setMenuLoadSucceeded(false);
        return;
      }

      setMenuLoadSucceeded(true);
      setMenuStatus(result.status);
      setOrderDate(result.orderDate);
      setMenuItems(result.menuItems);
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId, deliveryDate, fulfillRequest?.requesterProfileId, profileId]);

  const menuPresentation = resolveLateOrderMenuPresentation({
    loading: loadingMenu,
    loadSucceeded: menuLoadSucceeded,
    rpcStatus: menuStatus,
    menuItemCount: menuItems.length,
  });

  const menuUnavailableMessage = lateOrderMenuUnavailableMessage(menuPresentation);

  const showWorkflowForm =
    !noActionableCycles && Boolean(providerId && deliveryDate);

  const submitDisabled =
    loadingMenu ||
    !providerId ||
    !profileId ||
    !deliveryDate ||
    menuPresentation.kind !== "ready";

  const handleFormAction = async (formData: FormData) => {
    formData.set("profileId", profileId);
    formData.set("deliveryDate", deliveryDate);
    const officeLocationId = String(formData.get("officeLocationId") ?? "").trim();

    const result = fulfillRequest
      ? await fulfillStaffLateOrderRequestAction({
          requestId: fulfillRequest.id,
          items: buildSnapshotOrderPayload(formData),
          specialInstructions: String(formData.get("specialInstructions") ?? ""),
          officeLocationId,
        })
      : await createHrLateOrderFormAction(formData);

    if (result.success) {
      showToast({
        title: LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE,
        durationMs: LATE_ORDER_CREATE_SUCCESS_TOAST_DURATION_MS,
      });
      setProfileId("");
      setMenuSelectionEpoch((value) => value + 1);
      onCreateSuccess();
      return;
    }

    showToast({
      variant: "error",
      title: formatLateOrderCreateErrorMessage(result.error),
    });
  };

  const orderDetailsPrefix = (
    <>
      {fulfillRequest ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted">
          <p className="font-medium text-foreground">Staff request (read-only)</p>
          <p className="mt-1">{fulfillRequest.requestedSummary}</p>
          {fulfillRequest.quantity > 1 ? (
            <p className="mt-1">Quantity requested: {fulfillRequest.quantity}</p>
          ) : null}
          {fulfillRequest.specialInstructions ? (
            <p className="mt-1">Notes: {fulfillRequest.specialInstructions}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <div className="block space-y-1.5">
          <span id="late-order-employee-label" className={formControlLabelClassName}>
            Employee
          </span>
          {fulfillRequest ? (
            <ReadOnlyFormValue
              id="late-order-employee-picker"
              value={fulfillRequest.requesterName}
            />
          ) : (
            <EmployeePicker
              id="late-order-employee-picker"
              aria-labelledby="late-order-employee-label"
              employees={employees}
              value={profileId}
              onValueChange={setProfileId}
            />
          )}
        </div>

        <div className="block space-y-1.5">
          <span className={formControlLabelClassName}>Provider</span>
          {fulfillRequest ? (
            <ReadOnlyFormValue id="late-order-provider-readonly" value={fulfillRequest.providerName} />
          ) : (
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className={`${selectClassName} block w-full`}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="block space-y-1.5">
          <label htmlFor="scheduled-delivery-control" className={formControlLabelClassName}>
            Scheduled delivery
          </label>
          {fulfillRequest ? (
            <ReadOnlyFormValue
              id="scheduled-delivery-control"
              value={formatHumanDate(fulfillRequest.scheduledDeliveryDate)}
              showCalendarIcon
            />
          ) : actionableCycles.length === 1 ? (
            <ReadOnlyFormValue
              id="scheduled-delivery-control"
              value={formatHumanDate(actionableCycles[0]!.deliveryDate)}
              showCalendarIcon
            />
          ) : actionableCycles.length > 1 ? (
            <select
              id="scheduled-delivery-control"
              value={deliveryDate}
              onChange={(event) =>
                setDeliveryPickByProvider((current) => ({
                  ...current,
                  [providerId]: event.target.value,
                }))
              }
              className={`${selectClassName} block w-full`}
            >
              {actionableCycles.map((cycle) => (
                <option key={cycle.deliveryDate} value={cycle.deliveryDate}>
                  {formatHumanDate(cycle.deliveryDate)}
                </option>
              ))}
            </select>
          ) : (
            <ReadOnlyFormValue
              id="scheduled-delivery-control"
              value="No open delivery cycles"
            />
          )}
        </div>
      </div>

      <p className="min-h-5 text-sm leading-5 text-muted">
        Order cycle date:{" "}
        {loadingMenu ? (
          LATE_ORDER_CYCLE_DATE_LOADING_LABEL
        ) : orderDate ? (
          <>
            {formatHumanDate(orderDate)}
            {orderDate === jamaicaToday ? " (current Jamaica order day)" : null}
          </>
        ) : (
          "—"
        )}
      </p>
    </>
  );

  return showWorkflowForm ? (
    <ProviderOrderForm
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
      submitLabel={fulfillRequest ? "Fulfill request" : "Create late order"}
      pendingLabel={fulfillRequest ? "Fulfilling request…" : "Creating late order…"}
      officeLocations={locations}
      defaultOfficeLocationId={
        fulfillRequest?.officeLocationId ?? locations[0]?.id ?? null
      }
      allowDefaultLocationUpdate={false}
      stableSplitLayout
      showSubsidyNote={false}
      layoutVariant="late-order"
      orderDetailsPrefix={orderDetailsPrefix}
      menuLoading={loadingMenu}
      submitDisabled={submitDisabled}
      menuUnavailableMessage={menuUnavailableMessage}
      menuUnavailableVariant={
        menuPresentation.kind === "load_error" ? "error" : "warning"
      }
      menuSelectionEpoch={menuSelectionEpoch}
    />
  ) : (
    <Card padding="sm" className={lateOrderMajorCardClassName}>
      <LateOrderSectionHeader icon={<IconClipboard aria-hidden />} title="1. Order Details" />
      <div className="mt-4 space-y-3">{orderDetailsPrefix}</div>
      {noActionableCycles ? (
        <p className="mt-4 text-sm text-muted">
          Late-order creation is disabled until the company cutoff has passed and this
          provider&apos;s late-order window is open.
        </p>
      ) : null}
      {!noActionableCycles && !deliveryDate ? (
        <p className="mt-4 text-sm text-muted">
          Choose a provider with an open cycle to build a late order.
        </p>
      ) : null}
    </Card>
  );
}
