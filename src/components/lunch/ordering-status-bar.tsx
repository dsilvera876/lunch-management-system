"use client";

import { useRef } from "react";
import { formatHumanDate } from "@/lib/format";
import { formatJamaicaWallClockTime } from "@/lib/settings";
import { formatTimeRemainingUntilDeadline } from "@/lib/home-dashboard";
import { Card } from "@/components/ui/card";
import { IconCalendar, IconMapPin } from "@/components/icons/line-icons";
import { OrderLocationPopover } from "@/components/lunch/order-location-popover";
import type { OfficeLocationOption } from "@/lib/office-locations";

type Props = {
  orderingOpen: boolean;
  deliveryDate: string | null;
  cutoffTime: string;
  orderDeadline: string | null;
  closedMessage?: string | null;
  locationName: string | null;
  officeLocations?: OfficeLocationOption[];
  selectedLocationId?: string;
  onSelectLocation?: (locationId: string) => void;
  locationPickerOpen?: boolean;
  onLocationPickerOpenChange?: (open: boolean) => void;
  defaultOfficeLocationId?: string | null;
  initialDefaultLocationId?: string;
  showSaveAsDefault?: boolean;
  saveAsDefault?: boolean;
  onSaveAsDefaultChange?: (value: boolean) => void;
};

export function OrderingStatusBar({
  orderingOpen,
  deliveryDate,
  cutoffTime,
  orderDeadline,
  closedMessage,
  locationName,
  officeLocations = [],
  selectedLocationId = "",
  onSelectLocation,
  locationPickerOpen = false,
  onLocationPickerOpenChange,
  defaultOfficeLocationId = null,
  initialDefaultLocationId = "",
  showSaveAsDefault = false,
  saveAsDefault = false,
  onSaveAsDefaultChange,
}: Props) {
  const changeButtonRef = useRef<HTMLButtonElement>(null);

  const timeRemaining = orderingOpen
    ? formatTimeRemainingUntilDeadline(orderDeadline)
    : null;

  const statusLabel = orderingOpen ? "OPEN" : "CLOSED";

  const canPickLocation =
    officeLocations.length > 0 &&
    onSelectLocation &&
    onLocationPickerOpenChange;

  function openLocationPicker() {
    onLocationPickerOpenChange?.(true);
  }

  return (
    <Card padding="md" className="mb-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6 md:divide-x md:divide-border">
        <div className="md:pr-6">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div
              className={
                orderingOpen
                  ? "inline-flex items-center gap-2.5 rounded-full bg-emerald-50 px-4 py-2.5 ring-1 ring-emerald-200/90"
                  : "inline-flex items-center gap-2.5 rounded-full bg-amber-50 px-4 py-2.5 ring-1 ring-amber-200/90"
              }
            >
              <span
                className={
                  orderingOpen
                    ? "size-3 shrink-0 rounded-full bg-emerald-600"
                    : "size-3 shrink-0 rounded-full bg-amber-700"
                }
                aria-hidden
              />
              <span
                className={
                  orderingOpen
                    ? "text-lg font-bold tracking-wide text-emerald-900"
                    : "text-lg font-bold tracking-wide text-amber-950"
                }
              >
                {statusLabel}
              </span>
            </div>

            {orderingOpen && timeRemaining ? (
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-slate-900">{timeRemaining}</p>
                <p className="mt-0.5 text-sm text-muted">
                  Orders close at {formatJamaicaWallClockTime(cutoffTime)}
                </p>
              </div>
            ) : (
              <p className="max-w-sm text-sm font-medium text-slate-800">
                {closedMessage ?? "Ordering is closed for now."}
              </p>
            )}
          </div>
        </div>

        <div className="md:px-6">
          <div className="flex items-start gap-2.5">
            <IconCalendar size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Delivery
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {deliveryDate ? formatHumanDate(deliveryDate) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="md:pl-6">
          <div className="relative flex items-start gap-2.5">
            <IconMapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Deliver to
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {locationName ?? "Select location"}
                {canPickLocation ? (
                  <>
                    {" "}
                    <button
                      ref={changeButtonRef}
                      type="button"
                      aria-expanded={locationPickerOpen}
                      aria-haspopup="dialog"
                      className="font-semibold text-primary hover:underline"
                      onClick={openLocationPicker}
                    >
                      · {locationName ? "Change" : "Choose"}
                    </button>
                  </>
                ) : null}
              </p>

              {canPickLocation ? (
                <OrderLocationPopover
                  open={locationPickerOpen}
                  onOpenChange={onLocationPickerOpenChange}
                  locations={officeLocations}
                  selectedLocationId={selectedLocationId}
                  onSelectLocation={onSelectLocation}
                  defaultLocationId={defaultOfficeLocationId}
                  initialDefaultLocationId={initialDefaultLocationId}
                  showSaveAsDefault={showSaveAsDefault}
                  saveAsDefault={saveAsDefault}
                  onSaveAsDefaultChange={onSaveAsDefaultChange ?? (() => undefined)}
                  anchorRef={changeButtonRef}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
