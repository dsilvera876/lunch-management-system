"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { submitLunchCheckout } from "@/app/lunch/actions";
import { ProviderSelector } from "@/components/lunch/provider-selector";
import { ProviderMenuPanel } from "@/components/lunch/provider-menu-panel";
import { LunchCartPanel } from "@/components/lunch/lunch-cart-panel";
import { FormActionStatus } from "@/components/ui/form-action-status";
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
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { OfficeLocationOption } from "@/lib/office-locations";

type CheckoutSuccess = {
  orderCount: number;
  providerCount: number;
  orderGroupId: string;
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
  onRequestLocationPicker: () => void;
  onCheckoutSuccess: (payload: CheckoutSuccess) => void;
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
  onCheckoutSuccess,
}: Props) {
  const router = useRouter();
  const defaultId =
    initialProviderId && providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : providers[0]?.id ?? null;

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(defaultId);
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [cart, setCart] = useState<LunchCartEntry[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        hasWorkingDraft: draftHasSelectedItems(drafts[provider.id] ?? emptyProviderDraft()),
      })),
    [providers, drafts],
  );

  function updateDraftForProvider(providerId: string, next: ProviderDraft) {
    setDrafts((current) => ({
      ...current,
      [providerId]: next,
    }));
    setValidationError(null);
  }

  function updateDraft(next: ProviderDraft) {
    if (!selectedProviderId) {
      return;
    }

    updateDraftForProvider(selectedProviderId, next);
  }

  function handleAddToCart() {
    if (!selectedProvider || !canAddDraftToCart(draft)) {
      return;
    }

    const entry = createCartEntryFromDraft(selectedProvider, draft);
    setCart((current) => [...current, entry]);
    updateDraftForProvider(selectedProvider.id, emptyProviderDraft());
  }

  const checkoutGuidance =
    unfinishedDrafts.length > 0
      ? formatUnfinishedDraftMessage(unfinishedDrafts)
      : checkout.guidanceMessage;

  const canSubmit =
    orderingOpen &&
    cart.length > 0 &&
    unfinishedDrafts.length === 0 &&
    checkout.canSubmit &&
    (officeLocations.length === 0 || selectedOfficeLocationId.length > 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (officeLocations.length > 0 && !selectedOfficeLocationId) {
      setValidationError("Choose a delivery location before placing your order.");
      onRequestLocationPicker();
      return;
    }

    if (unfinishedDrafts.length > 0) {
      setValidationError(formatUnfinishedDraftMessage(unfinishedDrafts));
      return;
    }

    if (!checkout.canSubmit) {
      setValidationError(
        checkout.guidanceMessage ??
          "Complete your lunch cart before placing your order.",
      );
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const result = await submitLunchCheckout({
        orderDate,
        officeLocationId: selectedOfficeLocationId,
        saveAsDefault,
        cartEntries: cart,
      });

      if (result.ok) {
        setCart([]);
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
      );
    } finally {
      setIsSubmitting(false);
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
          disabled={!orderingOpen}
          onSelectMain={(itemId) => updateDraft(replaceMain(draft, itemId))}
          onRemoveMain={() => updateDraft(removeMain(draft))}
          onAddSide={(itemId) => updateDraft(addSide(draft, itemId))}
          onRemoveSide={(sideId) => updateDraft(removeSide(draft, sideId))}
          onAddStandalone={(itemId) => updateDraft(addStandalone(draft, itemId))}
          onRemoveStandalone={(itemId) => updateDraft(removeStandalone(draft, itemId))}
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
          canAddToCart={canAddDraftToCart(draft)}
          onAddToCart={handleAddToCart}
        />

        <LunchCartPanel
          cart={cart}
          checkout={checkout}
          providersById={providersById}
          dailySubsidy={dailySubsidy}
          existingOrderDateGross={existingOrderDateGross}
          guidanceMessage={checkoutGuidance}
          canSubmit={canSubmit}
          orderingOpen={orderingOpen}
          isSubmitting={isSubmitting}
          onClearAll={() => setCart([])}
          onRemoveEntry={(entryId) =>
            setCart((current) => current.filter((entry) => entry.id !== entryId))
          }
        />
      </div>

      {validationError ? (
        <FormActionStatus variant="error" className="mt-4">
          {validationError}
        </FormActionStatus>
      ) : null}
    </form>
  );
}
