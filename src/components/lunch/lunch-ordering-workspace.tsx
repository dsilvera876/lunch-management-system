"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitProviderOrder } from "@/app/lunch/actions";
import { ProviderSelector } from "@/components/lunch/provider-selector";
import { ProviderMenuPanel } from "@/components/lunch/provider-menu-panel";
import { OrderSummaryPanel } from "@/components/lunch/order-summary-panel";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { hasSelectedOrderItems } from "@/lib/order-payload";
import {
  addSide,
  addStandalone,
  calculateDraftSubtotal,
  draftToProviderPayload,
  emptyProviderDraft,
  removeMain,
  removeSide,
  removeStandalone,
  replaceMain,
  setStandaloneQuantity,
  validateProviderDraft,
  type ProviderDraft,
} from "@/lib/lunch-order-draft";
import { getLunchOrderErrorMessage } from "@/lib/lunch-order-errors";
import { isValidSpecialInstructions } from "@/lib/menu-items";
import { getOrderSummaryCompositionGuidance } from "@/lib/lunch-order-summary-ui";
import { clearSubmittedProviderDraft } from "@/lib/lunch-order-submit-ui";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { OfficeLocationOption } from "@/lib/office-locations";

type OrderPlacedSuccess = {
  providerId: string;
  providerName: string;
  orderId: string;
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
  onOrderPlacedSuccess: (payload: OrderPlacedSuccess) => void;
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
  onOrderPlacedSuccess,
}: Props) {
  const router = useRouter();
  const defaultId =
    initialProviderId && providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : providers[0]?.id ?? null;

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(defaultId);
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;

  const draft = selectedProviderId
    ? (drafts[selectedProviderId] ?? emptyProviderDraft())
    : emptyProviderDraft();

  function updateDraft(next: ProviderDraft) {
    if (!selectedProviderId) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [selectedProviderId]: next,
    }));
    setValidationError(null);
  }

  const menuItems = selectedProvider?.menuItems ?? [];
  const selectedMain =
    menuItems.find((item) => item.id === draft.mainId) ?? null;
  const selectedSides = menuItems.filter((item) => draft.sideIds.includes(item.id));
  const standaloneItems = menuItems
    .filter((item) => (draft.standaloneQuantities[item.id] ?? 0) > 0)
    .map((item) => ({
      ...item,
      quantity: draft.standaloneQuantities[item.id] ?? 0,
    }));

  const orderSubtotal = calculateDraftSubtotal(draft, menuItems);
  const validation = validateProviderDraft(draft);
  const payload = draftToProviderPayload(draft);
  const hasItems = hasSelectedOrderItems(payload);
  const canSubmit =
    orderingOpen &&
    hasItems &&
    validation.valid &&
    isValidSpecialInstructions(draft.specialInstructions);

  const compositionGuidance = getOrderSummaryCompositionGuidance(validation, canSubmit);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validation.valid) {
      setValidationError(validation.message ?? "Complete your order before placing it.");
      return;
    }

    if (!isValidSpecialInstructions(draft.specialInstructions)) {
      setValidationError("Special instructions must be 500 characters or fewer.");
      return;
    }

    if (officeLocations.length > 0 && !selectedOfficeLocationId) {
      setValidationError("Choose a delivery location before placing your order.");
      onRequestLocationPicker();
      return;
    }

    if (!selectedProvider || !selectedProviderId) {
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const result = await submitProviderOrder(new FormData(event.currentTarget));

      if (result.ok) {
        setDrafts((current) => clearSubmittedProviderDraft(current, result.providerId));
        onOrderPlacedSuccess({
          providerId: result.providerId,
          providerName: selectedProvider.name,
          orderId: result.orderId,
        });
        router.refresh();
        return;
      }

      setValidationError(getLunchOrderErrorMessage(result.errorCode));
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearCurrentDraft() {
    if (!selectedProviderId) {
      return;
    }

    updateDraft(emptyProviderDraft());
  }

  if (!selectedProvider) {
    return null;
  }

  const mealComplete = draft.mainId !== null && draft.sideIds.length > 0;

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="providerId" value={selectedProvider.id} />
      <input type="hidden" name="orderDate" value={orderDate} />
      {officeLocations.length > 0 ? (
        <input type="hidden" name="officeLocationId" value={selectedOfficeLocationId} />
      ) : null}
      {saveAsDefault ? <input type="hidden" name="saveAsDefault" value="on" /> : null}
      {draft.mainId ? (
        <input type="hidden" name="mainProviderMenuItemId" value={draft.mainId} />
      ) : null}
      {mealComplete ? (
        <input type="hidden" name="mealQuantity" value={draft.mealQuantity} />
      ) : null}
      {draft.sideIds.map((sideId) => (
        <input key={sideId} type="hidden" name={`side:${sideId}`} value="on" />
      ))}
      {Object.entries(draft.standaloneQuantities).map(([itemId, quantity]) =>
        quantity > 0 ? (
          <input
            key={itemId}
            type="hidden"
            name={`provider-quantity:${itemId}`}
            value={quantity}
          />
        ) : null,
      )}

      <ProviderSelector
        providers={providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
        }))}
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
        />

        <OrderSummaryPanel
          providerName={selectedProvider.name}
          main={selectedMain}
          sides={selectedSides}
          mealQuantity={draft.mealQuantity}
          mealIncomplete={validation.mealIncomplete}
          standaloneItems={standaloneItems}
          orderSubtotal={orderSubtotal}
          dailySubsidy={dailySubsidy}
          existingOrderDateGross={existingOrderDateGross}
          specialInstructions={draft.specialInstructions}
          guidanceMessage={!canSubmit ? compositionGuidance : null}
          onSpecialInstructionsChange={(value) =>
            updateDraft({ ...draft, specialInstructions: value })
          }
          onClearAll={clearCurrentDraft}
          onRemoveMain={() => updateDraft(removeMain(draft))}
          onRemoveSide={(sideId) => updateDraft(removeSide(draft, sideId))}
          onMealQuantityChange={(quantity) =>
            updateDraft({ ...draft, mealQuantity: quantity })
          }
          onStandaloneQuantityChange={(itemId, quantity) =>
            updateDraft(setStandaloneQuantity(draft, itemId, quantity))
          }
          onRemoveStandalone={(itemId) =>
            updateDraft(removeStandalone(draft, itemId))
          }
          orderingOpen={orderingOpen}
          canSubmit={canSubmit}
          isSubmitting={isSubmitting}
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
