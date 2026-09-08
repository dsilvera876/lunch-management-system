"use client";

import { useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { QuantityControl } from "@/components/quantity-control";
import { textareaClassName } from "@/components/ui/form-field";
import { calculateLineSubtotal, formatDisplayDate } from "@/lib/ordering-ui";
import { formatCurrency, formatPrice } from "@/lib/format";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  isValidSpecialInstructions,
  providerOffersMeals,
  validateOrderComposition,
  type MenuItemType,
} from "@/lib/menu-items";
import { OfficeLocationPicker } from "@/components/office-location-picker";
import type { OfficeLocationOption } from "@/lib/office-locations";
import {
  calculateMealBundleSubtotal,
  formatMealBundleLabel,
} from "@/lib/order-payload";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory?: string | null;
};

type Props = {
  providerId: string;
  providerName: string;
  orderDate: string;
  deliveryDate: string;
  menuItems: MenuItem[];
  formAction: (formData: FormData) => void | Promise<void>;
  quantityFieldPrefix?: string;
  mainFieldName?: string;
  hiddenFields?: React.ReactNode;
  defaultSelectedMainId?: string | null;
  defaultSelectedSideIds?: string[];
  defaultMealQuantity?: number;
  defaultStandaloneQuantities?: Record<string, number>;
  defaultSpecialInstructions?: string;
  submitLabel?: string;
  pendingLabel?: string;
  officeLocations?: OfficeLocationOption[];
  defaultOfficeLocationId?: string | null;
  defaultOfficeLocationName?: string | null;
  defaultOfficeLocationInactive?: boolean;
  preserveExistingLocation?: boolean;
};

function StandaloneItemCard({
  item,
  quantity,
  quantityFieldPrefix,
  onQuantityChange,
}: {
  item: MenuItem;
  quantity: number;
  quantityFieldPrefix: string;
  onQuantityChange: (quantity: number) => void;
}) {
  return (
    <Card padding="sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{formatMenuItemLabel(item.name, item.unitLabel)}</p>
          {item.description && (
            <p className="mt-1 text-sm text-muted">{item.description}</p>
          )}
          <p className="mt-1 text-sm font-medium">
            {Number(item.price) > 0 ? `${formatPrice(item.price)} per ${item.unitLabel.toLowerCase()}` : "Included"}
          </p>
        </div>
        <QuantityControl
          id={`${quantityFieldPrefix}:${item.id}`}
          name={`${quantityFieldPrefix}:${item.id}`}
          label="Quantity"
          price={item.price}
          defaultValue={quantity}
          onQuantityChange={onQuantityChange}
        />
      </div>
    </Card>
  );
}

export function ProviderOrderForm({
  providerId,
  providerName,
  orderDate,
  deliveryDate,
  menuItems,
  formAction,
  quantityFieldPrefix = "provider-quantity",
  mainFieldName = "mainProviderMenuItemId",
  hiddenFields,
  defaultSelectedMainId = null,
  defaultSelectedSideIds = [],
  defaultMealQuantity = 1,
  defaultStandaloneQuantities = {},
  defaultSpecialInstructions = "",
  submitLabel = "Place Order",
  pendingLabel = "Placing order...",
  officeLocations = [],
  defaultOfficeLocationId = null,
  defaultOfficeLocationName = null,
  defaultOfficeLocationInactive = false,
  preserveExistingLocation = false,
}: Props) {
  const grouped = useMemo(() => groupMenuItemsByType(menuItems), [menuItems]);
  const standaloneGrouped = useMemo(() => groupStandaloneItemsByCategory(grouped.standalone), [grouped.standalone]);
  const offersMeals = providerOffersMeals(menuItems);
  const [selectedMainId, setSelectedMainId] = useState<string | null>(
    defaultSelectedMainId,
  );
  const [selectedSideIds, setSelectedSideIds] = useState<Set<string>>(
    () => new Set(defaultSelectedSideIds),
  );
  const [mealQuantity, setMealQuantity] = useState(defaultMealQuantity);
  const [standaloneQuantities, setStandaloneQuantities] = useState<
    Record<string, number>
  >(defaultStandaloneQuantities);
  const [specialInstructions, setSpecialInstructions] = useState(
    defaultSpecialInstructions,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedMain = grouped.main.find((item) => item.id === selectedMainId) ?? null;
  const selectedSides = grouped.side.filter((item) => selectedSideIds.has(item.id));
  const selectedStandalone = grouped.standalone
    .map((item) => ({
      ...item,
      quantity: standaloneQuantities[item.id] ?? 0,
    }))
    .filter((item) => item.quantity > 0);

  const hasMealSelection = selectedMain !== null || selectedSides.length > 0;
  const mealSubtotal =
    selectedMain && selectedSides.length > 0
      ? calculateMealBundleSubtotal(mealQuantity, [
          Number(selectedMain.price),
          ...selectedSides.map((item) => Number(item.price)),
        ])
      : 0;

  const standaloneSubtotal = selectedStandalone.reduce(
    (sum, item) => sum + calculateLineSubtotal(item.price, item.quantity),
    0,
  );

  const orderTotal = mealSubtotal + standaloneSubtotal;

  function handleStandaloneQuantityChange(itemId: string, quantity: number) {
    setStandaloneQuantities((current) => ({
      ...current,
      [itemId]: quantity,
    }));
    setValidationError(null);
  }

  function toggleSide(itemId: string, checked: boolean) {
    setSelectedSideIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
    setValidationError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const composition = validateOrderComposition({
      mainSelected: selectedMainId !== null,
      sideCount: selectedSideIds.size,
      mealQuantity: hasMealSelection ? mealQuantity : 0,
      standaloneQuantities: Object.values(standaloneQuantities),
    });

    if (!composition.valid) {
      event.preventDefault();
      setValidationError(composition.message);
      return;
    }

    if (!isValidSpecialInstructions(specialInstructions)) {
      event.preventDefault();
      setValidationError("Special instructions must be 500 characters or fewer.");
      return;
    }

    const officeLocationId = (
      event.currentTarget.elements.namedItem("officeLocationId") as
        | HTMLInputElement
        | null
    )?.value;

    if (officeLocations.length > 0 && !officeLocationId) {
      event.preventDefault();
      setValidationError("Choose a delivery location before placing your order.");
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={offersMeals ? "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_384px]" : "max-w-2xl mx-auto"}>
      <div className="flex flex-col">
        {providerId ? (
          <>
            <input type="hidden" name="providerId" value={providerId} />
            <input type="hidden" name="orderDate" value={orderDate} />
          </>
        ) : null}
        {hiddenFields}

        {officeLocations.length > 0 && (
          <OfficeLocationPicker
            locations={officeLocations}
            defaultLocationId={defaultOfficeLocationId}
            defaultLocationName={defaultOfficeLocationName}
            defaultLocationInactive={defaultOfficeLocationInactive}
            preserveExistingLocation={preserveExistingLocation}
          />
        )}

        <SectionHeader
          title="Choose items"
          description={
            offersMeals
              ? "Build a meal with one main and at least one side, or order standalone items only."
              : "Select the items you want in this order."
          }
        />

        {offersMeals && grouped.main.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Main
            </h3>
            <div className="space-y-3">
              {grouped.main.map((item) => (
                <Card key={item.id} padding="sm">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name={mainFieldName}
                      value={item.id}
                      checked={selectedMainId === item.id}
                      onChange={() => {
                        setSelectedMainId(item.id);
                        setValidationError(null);
                      }}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">
                        {formatMenuItemLabel(item.name, item.unitLabel)}
                      </span>
                      {item.description && (
                        <span className="mt-1 block text-sm text-muted">
                          {item.description}
                        </span>
                      )}
                      <span className="mt-1 block text-sm font-medium">
                        {Number(item.price) > 0 ? `${formatPrice(item.price)} per ${item.unitLabel.toLowerCase()}` : "Included"}
                      </span>
                    </span>
                  </label>
                </Card>
              ))}
            </div>
          </section>
        )}

        {offersMeals && grouped.side.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Sides
            </h3>
            <div className="space-y-3">
              {grouped.side.map((item) => (
                <Card key={item.id} padding="sm">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      name={`side:${item.id}`}
                      checked={selectedSideIds.has(item.id)}
                      onChange={(event) => toggleSide(item.id, event.target.checked)}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">
                        {formatMenuItemLabel(item.name, item.unitLabel)}
                      </span>
                      {item.description && (
                        <span className="mt-1 block text-sm text-muted">
                          {item.description}
                        </span>
                      )}
                      <span className="mt-1 block text-sm font-medium">
                        {Number(item.price) > 0 ? `${formatPrice(item.price)} per ${item.unitLabel.toLowerCase()}` : "Included"}
                      </span>
                    </span>
                  </label>
                </Card>
              ))}
            </div>
          </section>
        )}

        {offersMeals && hasMealSelection && selectedMain && selectedSides.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-4">
              <QuantityControl
                id="mealQuantity"
                name="mealQuantity"
                label="Meal quantity"
                price={calculateMealBundleSubtotal(1, [
                  Number(selectedMain.price),
                  ...selectedSides.map((side) => Number(side.price)),
                ])}
                defaultValue={mealQuantity}
                onQuantityChange={(quantity) => {
                  setMealQuantity(quantity);
                  setValidationError(null);
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              Applies to the selected main and sides.
            </p>
          </section>
        )}

      {grouped.standalone.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {offersMeals ? "Optional items" : "Items"}
          </h3>
          <div className="space-y-6">
            {Object.entries(standaloneGrouped).map(([category, items]) => (
              <div key={category}>
                <h4 className="mb-2 text-sm font-medium text-muted">{category}</h4>
                <div className="space-y-3">
                  {items.map((item) => (
                    <StandaloneItemCard
                      key={item.id}
                      item={item}
                      quantity={standaloneQuantities[item.id] ?? 0}
                      quantityFieldPrefix={quantityFieldPrefix}
                      onQuantityChange={(quantity) =>
                        handleStandaloneQuantityChange(item.id, quantity)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <label htmlFor="specialInstructions" className="block text-sm font-medium">
          Special instructions <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="specialInstructions"
          name="specialInstructions"
          rows={3}
          maxLength={500}
          value={specialInstructions}
          onChange={(event) => {
            setSpecialInstructions(event.target.value);
            setValidationError(null);
          }}
          placeholder="Example: Extra gravy on rice, leg and thigh only, no garlic"
          className={`${textareaClassName} mt-2`}
        />
        <p className="mt-1 text-xs text-muted">
          Preparation notes for this order only. Up to 500 characters.
        </p>
      </section>
      </div>

      <div className={offersMeals ? "lg:sticky lg:top-8 lg:self-start" : "mt-8"}>
        {orderTotal > 0 && (
          <Card className="mb-6" padding="sm">
            <h3 className="text-sm font-semibold">Order summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Provider</dt>
                <dd className="font-medium text-right">{providerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Delivery</dt>
                <dd className="font-medium text-right">
                  {formatDisplayDate(deliveryDate)}
                </dd>
              </div>
            </dl>

            {selectedMain && selectedSides.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex justify-between gap-4 text-sm font-semibold">
                  <span>{formatMealBundleLabel(mealQuantity)}</span>
                  <span>{formatCurrency(mealSubtotal)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  <li>{formatMenuItemLabel(selectedMain.name, selectedMain.unitLabel)}</li>
                  {selectedSides.map((item) => (
                    <li key={item.id}>
                      {formatMenuItemLabel(item.name, item.unitLabel)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedStandalone.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {offersMeals ? "Optional items" : "Items"}
                </h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {selectedStandalone.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span>{formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}</span>
                      <span className="shrink-0 font-medium">
                        {formatCurrency(calculateLineSubtotal(item.price, item.quantity))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {specialInstructions.trim().length > 0 && (
              <div className="mt-4 border-t border-border pt-4 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Special instructions
                </h4>
                <p className="mt-2 whitespace-pre-wrap">{specialInstructions.trim()}</p>
              </div>
            )}

            <div className="mt-4 flex justify-between gap-4 border-t border-border pt-4 text-sm font-semibold">
              <span>Order total</span>
              <span>{formatCurrency(orderTotal)}</span>
            </div>

            <p className="mt-3 text-xs text-muted">
              Any daily lunch subsidy is calculated across all of your qualifying
              orders for this delivery date, not per individual order.
            </p>
          </Card>
        )}

        {validationError && (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {validationError}
          </p>
        )}

        <div className="sticky bottom-4 lg:static lg:bottom-auto z-10">
          <FormSubmitButton pendingText={pendingLabel} variant="primary" className="w-full shadow-md lg:shadow-none">
            {submitLabel}
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
