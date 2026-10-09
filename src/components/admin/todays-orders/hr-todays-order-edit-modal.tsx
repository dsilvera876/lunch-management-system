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
import { HrTodaysOrderEditReasonField } from "@/components/admin/todays-orders/hr-todays-order-edit-reason-field";
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
import {
  HR_EDIT_REASON_REQUIRED_MESSAGE,
  HR_TODAYS_ORDER_EDIT_DIALOG_CLASS,
  HR_TODAYS_ORDER_EDIT_PANEL_CLASS,
  HR_TODAYS_ORDER_EDIT_SCROLL_CLASS,
} from "@/lib/hr-todays-order-edit-modal-presentation";
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
  const reasonFieldRef = useRef<HTMLTextAreaElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const reasonErrorId = useId();
  const [context, setContext] = useState<HrStaffOrderEditContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [, startSave] = useTransition();

  function resetEditDraft() {
    const cleared = hrEditModalDraftOnSessionEnd();
    setContext(cleared.context);
    setReason(cleared.reason);
    setReasonError(null);
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
    setReasonError(null);
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

  const reasonField = (
    <HrTodaysOrderEditReasonField
      reasonId={reasonId}
      reasonHelperId={reasonHelperId}
      reasonErrorId={reasonErrorId}
      reason={reason}
      reasonError={reasonError}
      onReasonChange={(value) => {
        setReason(value);
        reasonFieldRef.current?.setCustomValidity("");
        if (reasonError) {
          setReasonError(null);
        }
      }}
      fieldRef={reasonFieldRef}
    />
  );

  function getReasonFieldElement(): HTMLTextAreaElement | null {
    if (typeof document === "undefined") {
      return null;
    }
    const byId = document.getElementById(reasonId);
    if (byId instanceof HTMLTextAreaElement) {
      return byId;
    }
    return reasonFieldRef.current;
  }

  function reportReasonRequired(): boolean {
    const normalized = normalizeHrOrderMutationReason(reason);
    if (normalized) {
      getReasonFieldElement()?.setCustomValidity("");
      setReasonError(null);
      return true;
    }

    setFormError(null);
    setReasonError(HR_EDIT_REASON_REQUIRED_MESSAGE);
    const field = getReasonFieldElement();
    if (field) {
      field.setCustomValidity(HR_EDIT_REASON_REQUIRED_MESSAGE);
      field.reportValidity();
    }
    return false;
  }

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
      className={HR_TODAYS_ORDER_EDIT_DIALOG_CLASS}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close edit order dialog"
        onClick={dismissModal}
      />
      <div className={HR_TODAYS_ORDER_EDIT_PANEL_CLASS}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
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

        <div className={HR_TODAYS_ORDER_EDIT_SCROLL_CLASS}>
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
              stableSplitLayout
              submitLabel="Save changes"
              pendingLabel="Saving…"
              menuLoading={loading}
              submitDisabled={loading}
              submitFooter={reasonField}
              clientSubmitGuard={reportReasonRequired}
              showClientSubmitError={(error) => error !== HR_EDIT_REASON_REQUIRED_MESSAGE}
              onClientSubmit={(formData) => {
                return new Promise((resolve) => {
                  const normalizedReason = normalizeHrOrderMutationReason(reason);
                  if (!normalizedReason) {
                    resolve({ ok: false, error: HR_EDIT_REASON_REQUIRED_MESSAGE });
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
      </div>
    </FocusTrapPopover>
  );
}
