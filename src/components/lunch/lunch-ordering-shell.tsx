"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMyDefaultOfficeLocation } from "@/app/account/actions";
import { CheckoutSuccessPanel } from "@/components/lunch/checkout-success-panel";
import { OrderingStatusBar } from "@/components/lunch/ordering-status-bar";
import { LunchOrderingWorkspace } from "@/components/lunch/lunch-ordering-workspace";
import {
  getOfficeLocationDisplayName,
  resolveInitialOfficeLocationId,
  shouldPersistDefaultOnLocationConfirm,
} from "@/lib/lunch-office-location-selection";
import { buildCheckoutSuccessToastBody } from "@/lib/lunch-order-submit-ui";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { OfficeLocationOption } from "@/lib/office-locations";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";

type Props = {
  providers: ProviderMenuBundle[];
  initialProviderId: string | null;
  orderDate: string;
  orderingOpen: boolean;
  dailySubsidy: number;
  existingOrderDateGross: number;
  officeLocations: OfficeLocationOption[];
  defaultOfficeLocationId: string | null;
  defaultOfficeLocationName: string | null;
  defaultOfficeLocationInactive: boolean;
  deliveryDate: string | null;
  cutoffTime: string;
  orderDeadline: string | null;
  closedMessage?: string | null;
  /** When true, do not auto-open the normal-order location popover on mount. */
  deferInitialLocationPicker?: boolean;
  menuItemRatingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
  ratingsLoadErrorMessage?: string | null;
};

export function LunchOrderingShell({
  providers,
  initialProviderId,
  orderDate,
  orderingOpen,
  dailySubsidy,
  existingOrderDateGross,
  officeLocations,
  defaultOfficeLocationId,
  defaultOfficeLocationName,
  defaultOfficeLocationInactive,
  deliveryDate,
  cutoffTime,
  orderDeadline,
  closedMessage,
  deferInitialLocationPicker = false,
  menuItemRatingSummaries,
  ratingsLoadFailed,
  ratingsLoadErrorMessage,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const initialDefaultLocationId = useMemo(
    () =>
      resolveInitialOfficeLocationId(
        officeLocations,
        defaultOfficeLocationId,
        defaultOfficeLocationInactive,
      ),
    [officeLocations, defaultOfficeLocationId, defaultOfficeLocationInactive],
  );

  const [selectedLocationId, setSelectedLocationId] = useState(initialDefaultLocationId);
  const [saveAsDefault, setSaveAsDefault] = useState(defaultOfficeLocationId === null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(
    () =>
      !deferInitialLocationPicker &&
      officeLocations.length > 0 &&
      initialDefaultLocationId === "",
  );
  const [defaultSaveError, setDefaultSaveError] = useState<string | null>(null);
  const [locationPickerNotice, setLocationPickerNotice] = useState<string | null>(null);
  const locationPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<{
    body: string;
    focusKey: number;
  } | null>(null);

  const locationName = getOfficeLocationDisplayName(
    officeLocations,
    selectedLocationId,
    selectedLocationId ? null : defaultOfficeLocationName,
  );

  function handleLocationPickerOpenChange(open: boolean) {
    if (open) {
      locationPickerReturnFocusRef.current = null;
    } else {
      setLocationPickerNotice(null);
    }
    setLocationPickerOpen(open);
  }

  function handleRequestLocationPicker(notice: string) {
    const active = document.activeElement;
    locationPickerReturnFocusRef.current = active instanceof HTMLElement ? active : null;
    setLocationPickerNotice(notice);
    setLocationPickerOpen(true);
  }

  function handleConfirmLocation(locationId: string, saveDefault: boolean) {
    if (!locationId) {
      return;
    }

    setSelectedLocationId(locationId);
    setSaveAsDefault(saveDefault);
    setLocationPickerOpen(false);
    setLocationPickerNotice(null);
    setDefaultSaveError(null);

    if (
      !shouldPersistDefaultOnLocationConfirm(
        saveDefault,
        defaultOfficeLocationId,
        locationId,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await saveMyDefaultOfficeLocation(locationId);

      if (!result.ok) {
        setDefaultSaveError(
          "Your delivery location was selected for this order, but your default preference could not be saved. Try again from Preferences or re-select with save checked.",
        );
        return;
      }

      setSaveAsDefault(false);
      router.refresh();
    });
  }

  const persistDefaultOnCheckout = shouldPersistDefaultOnLocationConfirm(
    saveAsDefault,
    defaultOfficeLocationId,
    selectedLocationId,
  );

  function handleCheckoutSuccess(payload: { orderCount: number; providerCount: number }) {
    setCheckoutSuccess((current) => ({
      body: buildCheckoutSuccessToastBody(
        payload.orderCount,
        payload.providerCount,
        deliveryDate,
      ),
      focusKey: (current?.focusKey ?? 0) + 1,
    }));
  }

  return (
    <>
      {checkoutSuccess ? (
        <CheckoutSuccessPanel
          body={checkoutSuccess.body}
          focusKey={checkoutSuccess.focusKey}
        />
      ) : null}

      <OrderingStatusBar
        orderingOpen={orderingOpen}
        deliveryDate={deliveryDate}
        cutoffTime={cutoffTime}
        orderDeadline={orderDeadline}
        closedMessage={closedMessage}
        locationName={locationName}
        officeLocations={officeLocations}
        selectedLocationId={selectedLocationId}
        onConfirmLocation={handleConfirmLocation}
        locationPickerOpen={locationPickerOpen}
        onLocationPickerOpenChange={handleLocationPickerOpenChange}
        locationPickerNotice={locationPickerNotice}
        locationPickerReturnFocusRef={locationPickerReturnFocusRef}
        initialDefaultLocationId={initialDefaultLocationId}
        showSaveAsDefault
        saveAsDefault={saveAsDefault}
        defaultSaveError={defaultSaveError}
      />

      <LunchOrderingWorkspace
        providers={providers}
        initialProviderId={initialProviderId}
        orderDate={orderDate}
        orderingOpen={orderingOpen}
        dailySubsidy={dailySubsidy}
        existingOrderDateGross={existingOrderDateGross}
        officeLocations={officeLocations}
        selectedOfficeLocationId={selectedLocationId}
        saveAsDefault={persistDefaultOnCheckout}
        onRequestLocationPicker={handleRequestLocationPicker}
        onCheckoutStart={() => setCheckoutSuccess(null)}
        onCheckoutSuccess={handleCheckoutSuccess}
        menuItemRatingSummaries={menuItemRatingSummaries}
        ratingsLoadFailed={ratingsLoadFailed}
        ratingsLoadErrorMessage={ratingsLoadErrorMessage}
      />
    </>
  );
}
