"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { submitLunchCheckout } from "@/app/lunch/actions";
import { ProviderSelector } from "@/components/lunch/provider-selector";
import { ProviderMenuPanel } from "@/components/lunch/provider-menu-panel";
import { LunchCartPanel } from "@/components/lunch/lunch-cart-panel";
import {
  canAddDraftToCart,
  createCartEntryFromDraft,
  findUnfinishedWorkingDrafts,
  formatUnfinishedDraftMessage,
  type LunchCartEntry,
} from "@/lib/lunch-cart";
import {
  addSide,
  addStandalone,
  emptyProviderDraft,
  removeMain,
  removeSide,
  removeStandalone,
  replaceMain,
  setStandaloneQuantity,
  type ProviderDraft,
} from "@/lib/lunch-order-draft";
import { draftHasSelectedItems } from "@/lib/lunch-checkout";
import { getLunchOrderErrorMessage } from "@/lib/lunch-order-errors";
import { validateLunchCart } from "@/lib/lunch-checkout";
import {
  resolveCheckoutBlock,
  resolveClientCheckoutErrorInvalidation,
  resolveServerCheckoutErrorInvalidation,
  shouldInvalidateCheckoutError,
  type CheckoutErrorChange,
  type CheckoutErrorInvalidation,
} from "@/lib/lunch-checkout-accessibility";
import { focusFormErrorSummary } from "@/lib/staff-form-accessibility";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { OfficeLocationOption } from "@/lib/office-locations";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";

type CheckoutSuccess = {
  orderCount: number;
  providerCount: number;
  orderGroupId: string;
};

type CheckoutError = {
  message: string;
  /** False when another flow (the location picker) owns focus. */
  focusSummary: boolean;
  invalidation: CheckoutErrorInvalidation;
};

type Props = {
  providers: ProviderMenuBundle[];
  initialProviderId: string | null;
  orderDate: string;
  orderingOpen: boolean;
  dailySubsidy: number;
  existingOrderDateGross: number;
  officeLocations: OfficeLocationOption[];
  selectedOfficeLocationId: string;
  saveAsDefault: boolean;
  onRequestLocationPicker: (notice: string) => void;
  onCheckoutPendingChange: (pending: boolean) => void;
  onCheckoutSuccess: (payload: CheckoutSuccess) => void;
  menuItemRatingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
  ratingsLoadErrorMessage?: string | null;
};

export function LunchOrderingWorkspace({
  providers,
  initialProviderId,
  orderDate,
  orderingOpen,
  dailySubsidy,
  existingOrderDateGross,
  officeLocations,
  selectedOfficeLocationId,
  saveAsDefault,
  onRequestLocationPicker,
  onCheckoutPendingChange,
  onCheckoutSuccess,
  menuItemRatingSummaries,
  ratingsLoadFailed,
  ratingsLoadErrorMessage,
}: Props) {
  const router = useRouter();
  const defaultId =
    initialProviderId && providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : providers[0]?.id ?? null;

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(defaultId);
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [cart, setCart] = useState<LunchCartEntry[]>([]);
  const [checkoutError, setCheckoutError] = useState<CheckoutError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusEntryRequest, setFocusEntryRequest] = useState<{
    entryId: string;
    nonce: number;
  } | null>(null);
  const validationErrorRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const previousOfficeLocationIdRef = useRef(selectedOfficeLocationId);
  const previousOrderingStateRef = useRef({ orderDate, orderingOpen });
  const checkoutErrorSummaryId = useId();

  useEffect(() => {
    if (!checkoutError?.focusSummary) {
      return;
    }
    focusFormErrorSummary(validationErrorRef.current);
  }, [checkoutError]);

  useEffect(() => {
    if (previousOfficeLocationIdRef.current === selectedOfficeLocationId) {
      return;
    }
    previousOfficeLocationIdRef.current = selectedOfficeLocationId;
    setCheckoutError((current) =>
      current &&
      shouldInvalidateCheckoutError(current.invalidation, { kind: "delivery-location" })
        ? null
        : current,
    );
  }, [selectedOfficeLocationId]);

  useEffect(() => {
    const previous = previousOrderingStateRef.current;
    if (previous.orderDate === orderDate && previous.orderingOpen === orderingOpen) {
      return;
    }
    previousOrderingStateRef.current = { orderDate, orderingOpen };
    setCheckoutError((current) =>
      current && shouldInvalidateCheckoutError(current.invalidation, { kind: "ordering-state" })
        ? null
        : current,
    );
  }, [orderDate, orderingOpen]);

  function setValidationError(
    message: string,
    invalidation: CheckoutErrorInvalidation,
    options?: { focusSummary?: boolean },
  ) {
    setCheckoutError({
      message,
      focusSummary: options?.focusSummary ?? true,
      invalidation,
    });
  }

  function clearValidationError(change: CheckoutErrorChange) {
    setCheckoutError((current) =>
      current && shouldInvalidateCheckoutError(current.invalidation, change) ? null : current,
    );
  }

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;

  const draft = selectedProviderId
    ? (drafts[selectedProviderId] ?? emptyProviderDraft())
    : emptyProviderDraft();

  const checkout = useMemo(() => validateLunchCart(providers, cart), [providers, cart]);

  const unfinishedDrafts = useMemo(
    () => findUnfinishedWorkingDrafts(providers, drafts),
    [providers, drafts],
  );

  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const providerTabs = useMemo(
    () =>
      providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        iconKey: provider.iconKey,
        hasWorkingDraft: draftHasSelectedItems(drafts[provider.id] ?? emptyProviderDraft()),
      })),
    [providers, drafts],
  );

  function updateDraftForProvider(providerId: string, next: ProviderDraft) {
    if (submittingRef.current) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [providerId]: next,
    }));
    clearValidationError({ kind: "draft" });
  }

  function updateDraft(next: ProviderDraft) {
    if (!selectedProviderId) {
      return;
    }

    updateDraftForProvider(selectedProviderId, next);
  }

  function getDraftForProvider(providerId: string): ProviderDraft {
    return drafts[providerId] ?? emptyProviderDraft();
  }

  function handleFinishOrder() {
    if (submittingRef.current || !selectedProvider || !canAddDraftToCart(draft)) {
      return;
    }

    const entry = createCartEntryFromDraft(selectedProvider, draft);
    setCart((current) => [...current, entry]);
    clearValidationError({
      kind: "cart",
      providerId: selectedProvider.id,
      removesProvider: false,
    });
    updateDraftForProvider(selectedProvider.id, emptyProviderDraft());
    setFocusEntryRequest((current) => ({
      entryId: entry.id,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }

  function clearCart() {
    if (submittingRef.current) {
      return;
    }

    setCart([]);
    clearValidationError({ kind: "cart", providerId: null, removesProvider: true });
  }

  function removeCartEntry(entryId: string) {
    if (submittingRef.current) {
      return;
    }

    const providerId = cart.find((entry) => entry.id === entryId)?.providerId ?? null;
    const removesProvider =
      providerId !== null && cart.filter((entry) => entry.providerId === providerId).length === 1;
    setCart((current) => current.filter((entry) => entry.id !== entryId));
    clearValidationError({ kind: "cart", providerId, removesProvider });
  }

  const checkoutGuidance =
    unfinishedDrafts.length > 0
      ? formatUnfinishedDraftMessage(unfinishedDrafts)
      : officeLocations.length > 0 && !selectedOfficeLocationId
        ? "Choose a delivery location."
        : checkout.guidanceMessage;

  const canSubmit =
    orderingOpen &&
    cart.length > 0 &&
    unfinishedDrafts.length === 0 &&
    checkout.canSubmit &&
    (officeLocations.length === 0 || selectedOfficeLocationId.length > 0);

  /** Explains why checkout cannot proceed. Returns true when blocked. */
  function explainCheckoutBlock(): boolean {
    const block = resolveCheckoutBlock({
      orderingOpen,
      locationRequired: officeLocations.length > 0 && !selectedOfficeLocationId,
      unfinishedDraftMessage:
        unfinishedDrafts.length > 0 ? formatUnfinishedDraftMessage(unfinishedDrafts) : null,
      cartReady: checkout.canSubmit,
      canSubmit,
      guidanceMessage: checkoutGuidance,
    });

    if (!block) {
      return false;
    }

    if (block.kind === "location") {
      setValidationError(block.message, resolveClientCheckoutErrorInvalidation(block.kind), {
        focusSummary: false,
      });
      onRequestLocationPicker(block.message);
      return true;
    }

    setValidationError(block.message, resolveClientCheckoutErrorInvalidation(block.kind));
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current || explainCheckoutBlock()) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setCheckoutError(null);
    onCheckoutPendingChange(true);

    try {
      const result = await submitLunchCheckout({
        orderDate,
        officeLocationId: selectedOfficeLocationId,
        saveAsDefault,
        cartEntries: cart,
      });

      if (result.ok) {
        setCart([]);
        setDrafts({});
        onCheckoutSuccess({
          orderCount: result.orderIds.length,
          providerCount: new Set(result.providerIds).size,
          orderGroupId: result.orderGroupId,
        });
        router.refresh();
        return;
      }

      setValidationError(
        result.message ??
          (result.providerName
            ? `${result.providerName}: ${getLunchOrderErrorMessage(result.errorCode)}`
            : getLunchOrderErrorMessage(result.errorCode)),
        resolveServerCheckoutErrorInvalidation(result.errorCode, result.providerId),
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      onCheckoutPendingChange(false);
    }
  }

  if (!selectedProvider) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit}>
      <ProviderSelector
        providers={providerTabs}
        selectedId={selectedProviderId}
        onSelect={setSelectedProviderId}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <ProviderMenuPanel
          providerId={selectedProvider.id}
          providerName={selectedProvider.name}
          providerDescription={selectedProvider.description}
          menuItems={selectedProvider.menuItems}
          draft={draft}
          disabled={!orderingOpen || isSubmitting}
          onSelectMain={(itemId) => updateDraft(replaceMain(draft, itemId))}
          onAddSide={(itemId) => updateDraft(addSide(draft, itemId))}
          onAddStandalone={(itemId) => updateDraft(addStandalone(draft, itemId))}
          specialInstructions={draft.specialInstructions}
          onSpecialInstructionsChange={(value) =>
            updateDraft({ ...draft, specialInstructions: value })
          }
          onMealQuantityChange={(quantity) =>
            updateDraft({ ...draft, mealQuantity: quantity })
          }
          onStandaloneQuantityChange={(itemId, quantity) =>
            updateDraft(setStandaloneQuantity(draft, itemId, quantity))
          }
          canFinishOrder={canAddDraftToCart(draft)}
          onFinishOrder={handleFinishOrder}
          ratingsEnabled={selectedProvider.ratingsEnabled}
          ratingSummaries={menuItemRatingSummaries}
          ratingsLoadFailed={ratingsLoadFailed}
          ratingsLoadErrorMessage={ratingsLoadErrorMessage}
        />

        <LunchCartPanel
          cart={cart}
          drafts={drafts}
          providers={providers}
          checkout={checkout}
          providersById={providersById}
          dailySubsidy={dailySubsidy}
          existingOrderDateGross={existingOrderDateGross}
          guidanceMessage={checkoutGuidance}
          checkoutError={checkoutError}
          checkoutErrorSummaryId={checkoutErrorSummaryId}
          validationErrorRef={validationErrorRef}
          canSubmit={canSubmit}
          orderingOpen={orderingOpen}
          isSubmitting={isSubmitting}
          onClearAll={clearCart}
          onRemoveEntry={removeCartEntry}
          onRemoveInProgressMain={(providerId) =>
            updateDraftForProvider(providerId, removeMain(getDraftForProvider(providerId)))
          }
          onRemoveInProgressSide={(providerId, sideId) =>
            updateDraftForProvider(
              providerId,
              removeSide(getDraftForProvider(providerId), sideId),
            )
          }
          onRemoveInProgressStandalone={(providerId, itemId) =>
            updateDraftForProvider(
              providerId,
              removeStandalone(getDraftForProvider(providerId), itemId),
            )
          }
          focusEntryRequest={focusEntryRequest}
          onBlockedPlaceOrder={explainCheckoutBlock}
        />
      </div>
    </form>
  );
}
