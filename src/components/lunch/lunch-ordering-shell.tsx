"use client";

import { useMemo, useState } from "react";
import { OrderingStatusBar } from "@/components/lunch/ordering-status-bar";
import { LunchOrderingWorkspace } from "@/components/lunch/lunch-ordering-workspace";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  getOfficeLocationDisplayName,
  resolveInitialOfficeLocationId,
} from "@/lib/lunch-office-location-selection";
import { buildCheckoutSuccessToastBody } from "@/lib/lunch-order-submit-ui";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { OfficeLocationOption } from "@/lib/office-locations";

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
};

export function LunchOrderingShell(props: Props) {
  return (
    <ToastProvider>
      <LunchOrderingShellInner {...props} />
    </ToastProvider>
  );
}

function LunchOrderingShellInner({
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
}: Props) {
  const { showToast } = useToast();

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
    () => officeLocations.length > 0 && initialDefaultLocationId === "",
  );

  const locationName = getOfficeLocationDisplayName(
    officeLocations,
    selectedLocationId,
    selectedLocationId ? null : defaultOfficeLocationName,
  );

  function handleSelectLocation(locationId: string) {
    if (!locationId) {
      return;
    }

    setSelectedLocationId(locationId);
    setLocationPickerOpen(false);
  }

  function handleCheckoutSuccess(payload: { orderCount: number; providerCount: number }) {
    showToast({
      title: "Lunch order placed successfully",
      body: buildCheckoutSuccessToastBody(
        payload.orderCount,
        payload.providerCount,
        deliveryDate,
      ),
      action: { label: "View My Orders", href: "/my-orders" },
    });
  }

  return (
    <>
      <OrderingStatusBar
        orderingOpen={orderingOpen}
        deliveryDate={deliveryDate}
        cutoffTime={cutoffTime}
        orderDeadline={orderDeadline}
        closedMessage={closedMessage}
        locationName={locationName}
        officeLocations={officeLocations}
        selectedLocationId={selectedLocationId}
        onSelectLocation={handleSelectLocation}
        locationPickerOpen={locationPickerOpen}
        onLocationPickerOpenChange={setLocationPickerOpen}
        defaultOfficeLocationId={defaultOfficeLocationId}
        initialDefaultLocationId={initialDefaultLocationId}
        showSaveAsDefault={defaultOfficeLocationId === null}
        saveAsDefault={saveAsDefault}
        onSaveAsDefaultChange={setSaveAsDefault}
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
        saveAsDefault={saveAsDefault}
        onRequestLocationPicker={() => setLocationPickerOpen(true)}
        onCheckoutSuccess={handleCheckoutSuccess}
      />
    </>
  );
}
