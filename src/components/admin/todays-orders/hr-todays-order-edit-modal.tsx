"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import {
  fetchHrStaffOrderEditContextAction,
  hrModifyStaffOrderAction,
  type HrStaffOrderEditContext,
} from "@/app/admin/todays-orders/actions";
import { ProviderOrderForm } from "@/components/provider-order-form";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { formControlLabelClassName, textareaClassName } from "@/components/ui/form-field";
import { IconX } from "@/components/icons/line-icons";
import type { MenuItemType } from "@/lib/menu-items";
import {
  normalizeHrOrderMutationReason,
  snapshotPayloadToRpcJson,
} from "@/lib/hr-todays-order-mutation";
import {
  deriveHrEditFormDefaults,
  hrEditFormMountKey,
  hrEditModalDraftOnLoadStart,
  hrEditModalDraftOnSessionEnd,
  shouldApplyHrEditContextFetch,
} from "@/lib/hr-todays-order-edit-modal-session";
import { buildSnapshotOrderPayload } from "@/lib/order-payload";
import type { OperationalOrder } from "@/lib/operational-orders";
import { formatTodaysOrderDisplayDate } from "@/lib/todays-orders-presentation";
import { focusFormErrorSummary } from "@/lib/staff-form-accessibility";

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  order: OperationalOrder;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
};

function mapMenuItems(context: HrStaffOrderEditContext) {
  return context.menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    itemType: item.item_type as MenuItemType,
    unitLabel: item.unit_label,
    displayCategory: item.display_category,
  }));
}

export function HrTodaysOrderEditModal({
  open,
  triggerRef,
  order,
  onOpenChange,
  onSuccess,
}: Props) {
  const titleId = useId();
  const reasonId = useId();
  const reasonHelperId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<HrStaffOrderEditContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [, startSave] = useTransition();

  function resetEditDraft() {
    const cleared = hrEditModalDraftOnSessionEnd();
    setContext(cleared.context);
    setReason(cleared.reason);
    setFormError(cleared.formError);
    setLoadError(cleared.loadError);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetEditDraft();
    }
    onOpenChange(nextOpen);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const loadingDraft = hrEditModalDraftOnLoadStart();
    /* eslint-disable react-hooks/set-state-in-effect -- clear prior session before refetch */
    setContext(loadingDraft.context);
    setReason(loadingDraft.reason);
    setFormError(loadingDraft.formError);
    setLoadError(loadingDraft.loadError);
    /* eslint-enable react-hooks/set-state-in-effect */

    const requestedOrderId = order.id;
    let cancelled = false;

    startLoad(async () => {
      const result = await fetchHrStaffOrderEditContextAction(requestedOrderId);
      if (
        !shouldApplyHrEditContextFetch({
          requestedOrderId,
          currentOrderId: order.id,
          cancelled,
        })
      ) {
        return;
      }

      if (!result.ok) {
        setLoadError(result.error);
        setContext(null);
        return;
      }

      setContext(result.context);
    });

    return () => {
      cancelled = true;
    };
  }, [open, order.id]);

  useEffect(() => {
    if (formError || loadError) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [formError, loadError]);

  const defaults = context
    ? deriveHrEditFormDefaults(context.items, context.mealQuantity)
    : null;

  function dismissModal() {
    handleOpenChange(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  return (
    <FocusTrapPopover
      open={open}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      labelId={titleId}
      modal
      anchorPosition={false}
      initialFocusRef={headingRef}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
    >
      <button
        type="button"
        className="fixed inset-0 bg-slate-900/40"
        aria-label="Close edit order dialog"
        onClick={dismissModal}
      />
      <div className="relative z-10 my-8 w-full max-w-4xl rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900 outline-none"
            >
              Edit employee order
            </h2>
            <p className="mt-1 text-sm text-muted">
              {order.employeeName} · {order.providerName} · ordered{" "}
              {formatTodaysOrderDisplayDate(order.orderDate)} · delivery{" "}
              {formatTodaysOrderDisplayDate(order.deliveryDate)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close"
            onClick={dismissModal}
          >
            <IconX size={18} aria-hidden />
          </Button>
        </div>

        {loadError ? (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {loadError}
          </div>
        ) : null}

        {formError ? (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {formError}
          </div>
        ) : null}

        <div className="mb-4">
          <label htmlFor={reasonId} className={formControlLabelClassName}>
            Reason <span className="text-red-700">(required)</span>
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`${textareaClassName} mt-1.5`}
            aria-describedby={reasonHelperId}
          />
          <p id={reasonHelperId} className="mt-1 text-xs text-muted">
            Internal HR record only. Not included in the employee email.
          </p>
        </div>

        {context && defaults ? (
          <ProviderOrderForm
            key={hrEditFormMountKey(order.id, context.updatedAt)}
            providerId={order.providerId}
            providerName={order.providerName}
            orderDate={context.orderDate}
            deliveryDate={context.deliveryDate}
            menuItems={mapMenuItems(context)}
            formAction={async () => undefined}
            quantityFieldPrefix="quantity"
            mainFieldName="mainMenuItemId"
            defaultSelectedMainId={defaults.mainMenuItemId}
            defaultSelectedSideIds={defaults.sideMenuItemIds}
            defaultMealQuantity={defaults.mealQuantity}
            defaultStandaloneQuantities={defaults.standaloneQuantities}
            includeSpecialInstructions={false}
            showSubsidyNote={false}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            menuLoading={loading}
            submitDisabled={loading}
            onClientSubmit={(formData) => {
              return new Promise((resolve) => {
                const normalizedReason = normalizeHrOrderMutationReason(reason);
                if (!normalizedReason) {
                  resolve({ ok: false, error: "Enter a reason for this HR change." });
                  return;
                }

                startSave(async () => {
                  const payload = buildSnapshotOrderPayload(formData);
                  const result = await hrModifyStaffOrderAction({
                    orderId: order.id,
                    items: snapshotPayloadToRpcJson(payload),
                    reason: normalizedReason,
                    expectedUpdatedAt: context.updatedAt,
                  });

                  if (!result.ok) {
                    setFormError(result.error);
                    resolve({ ok: false, error: result.error });
                    return;
                  }

                  dismissModal();
                  onSuccess("Order updated. The employee will be notified by email.");
                  resolve({ ok: true });
                });
              });
            }}
          />
        ) : null}

        {!context && !loadError ? (
          <p className="text-sm text-muted" role="status">
            Loading menu…
          </p>
        ) : null}
      </div>
    </FocusTrapPopover>
  );
}
