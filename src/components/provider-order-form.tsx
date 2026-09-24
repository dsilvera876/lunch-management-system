"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  LateOrderSectionHeader,
  lateOrderMajorCardClassName,
} from "@/components/admin/late-orders/late-order-section-header";
import { LateOrderMenuLoadingSkeleton } from "@/components/admin/late-orders/late-order-menu-loading-skeleton";
import { LateOrderSummaryPanel } from "@/components/admin/late-orders/late-order-summary-panel";
import { IconClipboard, IconUtensils } from "@/components/icons/line-icons";
import {
  LATE_ORDER_MENU_LOADING_LABEL,
  LATE_ORDER_PROVIDER_MENU_LOADING_ANNOUNCEMENT,
} from "@/lib/late-orders-presentation";
import { OfficeLocationPicker } from "@/components/office-location-picker";
import {
  FormActionStatus,
  type FormActionStatusVariant,
} from "@/components/ui/form-action-status";
import type { OfficeLocationOption } from "@/lib/office-locations";
import {
  calculateMealBundleSubtotal,
  formatMealBundleLabel,
} from "@/lib/order-payload";

function lateOrderMenuOptionClassName(selected: boolean) {
  return [
    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
    selected
      ? "border-primary/45 bg-primary/[0.06]"
      : "border-border bg-surface hover:border-primary/30",
  ].join(" ");
}

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
  allowDefaultLocationUpdate?: boolean;
  /** Keeps menu left / summary right on desktop even for standalone-only menus (e.g. HR late orders). */
  stableSplitLayout?: boolean;
  showSubsidyNote?: boolean;
  layoutVariant?: "default" | "late-order";
  /** Employee / provider / delivery controls rendered inside Order Details (late-order layout). */
  orderDetailsPrefix?: ReactNode;
  /** HR late-order: saved menu fetch in progress — show skeleton, disable menu/submit. */
  menuLoading?: boolean;
  submitDisabled?: boolean;
  menuUnavailableMessage?: string | null;
  menuUnavailableVariant?: FormActionStatusVariant;
  /** HR late-order: reset menu selections when provider/delivery menu reloads or after create. */
  menuSelectionEpoch?: number;
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
  allowDefaultLocationUpdate = true,
  stableSplitLayout = false,
  showSubsidyNote = true,
  layoutVariant = "default",
  orderDetailsPrefix = null,
  menuLoading = false,
  submitDisabled = false,
  menuUnavailableMessage = null,
  menuUnavailableVariant = "warning",
  menuSelectionEpoch = 0,
}: Props) {
  const isLateOrderLayout = layoutVariant === "late-order";
  const compactMenuLayout = isLateOrderLayout;
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

  useEffect(() => {
    if (!isLateOrderLayout || menuSelectionEpoch === 0) {
      return;
    }

    /* Reset menu-builder state when provider/delivery menu reloads (scoped; shell stays mounted). */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional epoch-driven reset
    setSelectedMainId(null);
    setSelectedSideIds(new Set());
    setMealQuantity(defaultMealQuantity);
    setStandaloneQuantities({});
    setSpecialInstructions(defaultSpecialInstructions);
    setValidationError(null);
  }, [
    defaultMealQuantity,
    defaultSpecialInstructions,
    isLateOrderLayout,
    menuSelectionEpoch,
  ]);

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
    if (isLateOrderLayout && (menuLoading || submitDisabled)) {
      event.preventDefault();
      return;
    }

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

  const useSplitLayout =
    !isLateOrderLayout && (offersMeals || stableSplitLayout);

  const chooseItemsDescription = offersMeals
    ? "Build a meal with one main and at least one side, or order standalone items only."
    : "Select the items you want in this order.";

  const orderSummaryBody = (
    <>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Provider</dt>
          <dd className="text-right font-medium">{providerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Delivery</dt>
          <dd className="text-right font-medium">{formatDisplayDate(deliveryDate)}</dd>
        </div>
      </dl>

      {orderTotal === 0 && (stableSplitLayout || isLateOrderLayout) ? (
        <p className="mt-3 text-sm text-muted">
          Select items below to see line items and your order total.
        </p>
      ) : null}

      {selectedMain && selectedSides.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex justify-between gap-4 text-sm font-semibold">
            <span>{formatMealBundleLabel(mealQuantity)}</span>
            <span>{formatCurrency(mealSubtotal)}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>{formatMenuItemLabel(selectedMain.name, selectedMain.unitLabel)}</li>
            {selectedSides.map((item) => (
              <li key={item.id}>{formatMenuItemLabel(item.name, item.unitLabel)}</li>
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

      {orderTotal > 0 ? (
        <div className="mt-4 flex justify-between gap-4 border-t border-border pt-4 text-sm font-semibold">
          <span>Order total</span>
          <span>{formatCurrency(orderTotal)}</span>
        </div>
      ) : null}

      {showSubsidyNote && orderTotal > 0 ? (
        <p className="mt-3 text-xs text-muted">
          Any daily lunch subsidy is calculated across all of your qualifying orders for this
          delivery date, not per individual order.
        </p>
      ) : null}
    </>
  );

  const mainMenuSection =
    offersMeals && grouped.main.length > 0 ? (
      <section className={compactMenuLayout ? "" : "mb-8"}>
        <h3
          className={
            compactMenuLayout
              ? "text-sm font-semibold text-slate-900"
              : "mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
          }
        >
          {compactMenuLayout ? "Mains" : "Main"}
        </h3>
        {compactMenuLayout ? (
          <p className="mt-0.5 text-xs text-muted">Select one main item (required).</p>
        ) : null}
        <div className={compactMenuLayout ? "mt-2 space-y-2" : "space-y-3"}>
          {grouped.main.map((item) => {
            const label = (
              <>
                <span className="font-medium">{formatMenuItemLabel(item.name, item.unitLabel)}</span>
                {!compactMenuLayout && item.description ? (
                  <span className="mt-1 block text-sm text-muted">{item.description}</span>
                ) : null}
                <span
                  className={`block ${compactMenuLayout ? "text-xs text-muted" : "mt-1 text-sm font-medium"}`}
                >
                  {Number(item.price) > 0
                    ? `${formatPrice(item.price)} per ${item.unitLabel.toLowerCase()}`
                    : "Included"}
                </span>
              </>
            );

            const mainPriceLabel =
              compactMenuLayout && Number(item.price) > 0
                ? formatPrice(item.price)
                : compactMenuLayout
                  ? "Included"
                  : null;

            return compactMenuLayout ? (
              <label
                key={item.id}
                className={lateOrderMenuOptionClassName(selectedMainId === item.id)}
              >
                <input
                  type="radio"
                  name={mainFieldName}
                  value={item.id}
                  checked={selectedMainId === item.id}
                  onChange={() => {
                    setSelectedMainId(item.id);
                    setValidationError(null);
                  }}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">
                    {formatMenuItemLabel(item.name, item.unitLabel)}
                  </span>
                  {mainPriceLabel ? (
                    <span className="mt-0.5 block text-xs text-muted">{mainPriceLabel}</span>
                  ) : null}
                </span>
              </label>
            ) : (
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
                  <span className="min-w-0 flex-1">{label}</span>
                </label>
              </Card>
            );
          })}
        </div>
      </section>
    ) : null;

  const sideMenuSection =
    offersMeals && grouped.side.length > 0 ? (
      <section className={compactMenuLayout ? "" : "mb-8"}>
        <h3
          className={
            compactMenuLayout
              ? "text-sm font-semibold text-slate-900"
              : "mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
          }
        >
          Sides
        </h3>
        {compactMenuLayout ? (
          <p className="mt-0.5 text-xs text-muted">Select at least one side (required).</p>
        ) : null}
        <div className={compactMenuLayout ? "mt-2 space-y-2" : "space-y-3"}>
          {grouped.side.map((item) => {
            const label = (
              <>
                <span className="font-medium">{formatMenuItemLabel(item.name, item.unitLabel)}</span>
                {!compactMenuLayout && item.description ? (
                  <span className="mt-1 block text-sm text-muted">{item.description}</span>
                ) : null}
                <span
                  className={`block ${compactMenuLayout ? "text-xs text-muted" : "mt-1 text-sm font-medium"}`}
                >
                  {Number(item.price) > 0
                    ? `${formatPrice(item.price)} per ${item.unitLabel.toLowerCase()}`
                    : "Included"}
                </span>
              </>
            );

            const sidePriceLabel =
              compactMenuLayout && Number(item.price) > 0
                ? formatPrice(item.price)
                : compactMenuLayout
                  ? "Included"
                  : null;

            return compactMenuLayout ? (
              <label
                key={item.id}
                className={lateOrderMenuOptionClassName(selectedSideIds.has(item.id))}
              >
                <input
                  type="checkbox"
                  name={`side:${item.id}`}
                  checked={selectedSideIds.has(item.id)}
                  onChange={(event) => toggleSide(item.id, event.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">
                    {formatMenuItemLabel(item.name, item.unitLabel)}
                  </span>
                  {sidePriceLabel ? (
                    <span className="mt-0.5 block text-xs text-muted">{sidePriceLabel}</span>
                  ) : null}
                </span>
              </label>
            ) : (
              <Card key={item.id} padding="sm">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name={`side:${item.id}`}
                    checked={selectedSideIds.has(item.id)}
                    onChange={(event) => toggleSide(item.id, event.target.checked)}
                    className="mt-1 size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">{label}</span>
                </label>
              </Card>
            );
          })}
        </div>
      </section>
    ) : null;

  if (isLateOrderLayout) {
    const includeOrderDateField =
      orderDate.length > 0 && !menuLoading && !submitDisabled;

    return (
      <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
        {providerId ? (
          <>
            <input type="hidden" name="providerId" value={providerId} />
            {includeOrderDateField ? (
              <input type="hidden" name="orderDate" value={orderDate} />
            ) : null}
          </>
        ) : null}
        {hiddenFields}

        <Card padding="sm" className={lateOrderMajorCardClassName}>
          <LateOrderSectionHeader
            icon={<IconClipboard aria-hidden />}
            title="1. Order Details"
          />
          <div className="mt-4 space-y-3">{orderDetailsPrefix}</div>

          {officeLocations.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-stretch">
              <OfficeLocationPicker
                locations={officeLocations}
                defaultLocationId={defaultOfficeLocationId}
                defaultLocationName={defaultOfficeLocationName}
                defaultLocationInactive={defaultOfficeLocationInactive}
                preserveExistingLocation={preserveExistingLocation}
                allowDefaultLocationUpdate={allowDefaultLocationUpdate}
                embedded
                selectDisabled={menuLoading}
              />
              <LateOrderSummaryPanel
                providerName={providerName}
                deliveryDate={deliveryDate}
                mealQuantity={mealQuantity}
                mealSubtotal={mealSubtotal}
                selectedMain={selectedMain}
                selectedSides={selectedSides}
                selectedStandalone={selectedStandalone}
                specialInstructions={specialInstructions}
                orderTotal={orderTotal}
                loading={menuLoading}
                loadingLabel={LATE_ORDER_MENU_LOADING_LABEL}
              />
            </div>
          ) : (
            <div className="mt-4">
              <LateOrderSummaryPanel
                providerName={providerName}
                deliveryDate={deliveryDate}
                mealQuantity={mealQuantity}
                mealSubtotal={mealSubtotal}
                selectedMain={selectedMain}
                selectedSides={selectedSides}
                selectedStandalone={selectedStandalone}
                specialInstructions={specialInstructions}
                orderTotal={orderTotal}
                loading={menuLoading}
                loadingLabel={LATE_ORDER_MENU_LOADING_LABEL}
              />
            </div>
          )}
        </Card>

        <Card padding="sm" className={lateOrderMajorCardClassName}>
          <LateOrderSectionHeader
            icon={<IconUtensils aria-hidden />}
            title="2. Choose Items"
            description={chooseItemsDescription}
          />

          {menuLoading ? (
            <LateOrderMenuLoadingSkeleton
              visibleLabel={LATE_ORDER_MENU_LOADING_LABEL}
              screenReaderLabel={LATE_ORDER_PROVIDER_MENU_LOADING_ANNOUNCEMENT}
            />
          ) : menuUnavailableMessage ? (
            <FormActionStatus variant={menuUnavailableVariant} className="mt-4">
              {menuUnavailableMessage}
            </FormActionStatus>
          ) : null}

          {!menuLoading ? (
            <>
              {offersMeals && grouped.main.length > 0 && grouped.side.length > 0 ? (
                <div className="mt-4 grid gap-6 md:grid-cols-2 md:items-start">
                  {mainMenuSection}
                  <div className="min-w-0 md:border-l md:border-border md:pl-6">
                    {sideMenuSection}
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-6">
                  {mainMenuSection}
                  {sideMenuSection}
                </div>
              )}
            </>
          ) : null}

          {offersMeals && hasMealSelection && selectedMain && selectedSides.length > 0 && !menuLoading && (
            <section className="mt-4 rounded-lg border border-border bg-slate-50/60 p-3">
              <QuantityControl
                id="mealQuantity"
                name="mealQuantity"
                label="Meal quantity"
                layout="grouped"
                helperText="Applies to the selected main and sides."
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
            </section>
          )}

          {grouped.standalone.length > 0 && !menuLoading && (
            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">
                {offersMeals ? "Optional items" : "Items"}
              </h3>
              <div className="mt-3 space-y-4">
                {Object.entries(standaloneGrouped).map(([category, items]) => (
                  <div key={category}>
                    <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      {category}
                    </h4>
                    <div className="space-y-2">
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

          <section className="mt-6">
            <label htmlFor="specialInstructions" className="block text-sm font-medium">
              Special instructions <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="specialInstructions"
              name="specialInstructions"
              rows={3}
              maxLength={500}
              value={specialInstructions}
              disabled={menuLoading}
              onChange={(event) => {
                setSpecialInstructions(event.target.value);
                setValidationError(null);
              }}
              placeholder="Example: Extra gravy on rice, leg and thigh only, no garlic"
              className={`${textareaClassName} mt-2 disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <p className="mt-1 text-xs text-muted">
              Preparation notes for this order only. Up to 500 characters.
            </p>
          </section>

          {validationError ? (
            <FormActionStatus variant="error" className="mt-4">
              {validationError}
            </FormActionStatus>
          ) : null}

          <div className="mt-4">
            <FormSubmitButton
              pendingText={pendingLabel}
              variant="primary"
              disabled={menuLoading || submitDisabled}
            >
              {submitLabel}
            </FormSubmitButton>
          </div>
        </Card>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className={
        useSplitLayout
          ? "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_384px]"
          : "max-w-2xl mx-auto"
      }
    >
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
            allowDefaultLocationUpdate={allowDefaultLocationUpdate}
          />
        )}

        <SectionHeader title="Choose items" description={chooseItemsDescription} />

        {mainMenuSection}
        {sideMenuSection}

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

      <div className={useSplitLayout ? "lg:sticky lg:top-8 lg:self-start" : "mt-8"}>
        {(orderTotal > 0 || stableSplitLayout) && (
          <Card className="mb-6" padding="sm">
            <h3 className="text-sm font-semibold">Order summary</h3>
            <div className="mt-3">{orderSummaryBody}</div>
          </Card>
        )}

        {validationError ? (
          <FormActionStatus variant="error" className="mb-4">
            {validationError}
          </FormActionStatus>
        ) : null}

        <div className="sticky bottom-4 lg:static lg:bottom-auto z-10">
          <FormSubmitButton pendingText={pendingLabel} variant="primary" className="w-full shadow-md lg:shadow-none">
            {submitLabel}
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
