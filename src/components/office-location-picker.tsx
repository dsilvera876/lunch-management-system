"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { selectClassName } from "@/components/ui/form-field";
import {
  formatOfficeLocationLabel,
  type OfficeLocationOption,
} from "@/lib/office-locations";

type Props = {
  locations: OfficeLocationOption[];
  defaultLocationId: string | null;
  defaultLocationName?: string | null;
  defaultLocationInactive?: boolean;
  preserveExistingLocation?: boolean;
};

export function OfficeLocationPicker({
  locations,
  defaultLocationId,
  defaultLocationName,
  defaultLocationInactive = false,
  preserveExistingLocation = false,
}: Props) {
  const initialSelection = useMemo(() => {
    if (!defaultLocationId) {
      return "";
    }

    if (preserveExistingLocation) {
      return defaultLocationId;
    }

    if (
      !defaultLocationInactive &&
      locations.some((location) => location.id === defaultLocationId)
    ) {
      return defaultLocationId;
    }

    return "";
  }, [
    defaultLocationId,
    defaultLocationInactive,
    locations,
    preserveExistingLocation,
  ]);

  const [selectedLocationId, setSelectedLocationId] = useState(initialSelection);
  const [isChanging, setIsChanging] = useState(
    () => initialSelection.length === 0,
  );
  const [saveAsDefault, setSaveAsDefault] = useState(
    () => defaultLocationId === null,
  );

  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ?? null;

  const displayName =
    selectedLocation?.name ??
    defaultLocationName ??
    (defaultLocationInactive ? defaultLocationName : null) ??
    null;

  const needsExplicitSelection = initialSelection.length === 0;

  return (
    <section className="mb-8">
      <input
        type="hidden"
        name="officeLocationId"
        value={selectedLocationId}
      />
      {saveAsDefault ? (
        <input type="hidden" name="saveAsDefault" value="on" />
      ) : null}

      {needsExplicitSelection && isChanging ? (
        <Card padding="sm">
          <h3 className="text-sm font-semibold">
            Where should your lunch be delivered?
          </h3>
          <p className="mt-1 text-sm text-muted">
            Choose an active office location for this order.
          </p>
          <label htmlFor="officeLocationSelect" className="mt-4 block text-sm font-medium">
            Delivery location
          </label>
          <select
            id="officeLocationSelect"
            value={selectedLocationId}
            onChange={(event) => setSelectedLocationId(event.target.value)}
            required
            className={`${selectClassName} mt-2`}
          >
            <option value="" disabled>
              Select a location
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {formatOfficeLocationLabel(location.name, location.address)}
              </option>
            ))}
          </select>
          {defaultLocationId === null && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(event) => setSaveAsDefault(event.target.checked)}
                className="mt-1 size-4 shrink-0"
              />
              <span>Save as my default delivery location</span>
            </label>
          )}
        </Card>
      ) : isChanging ? (
        <Card padding="sm">
          <h3 className="text-sm font-semibold">Change delivery location</h3>
          <label htmlFor="officeLocationSelect" className="mt-4 block text-sm font-medium">
            Delivery location
          </label>
          <select
            id="officeLocationSelect"
            value={selectedLocationId}
            onChange={(event) => setSelectedLocationId(event.target.value)}
            required
            className={`${selectClassName} mt-2`}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {formatOfficeLocationLabel(location.name, location.address)}
              </option>
            ))}
          </select>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setSelectedLocationId(initialSelection);
                setIsChanging(false);
              }}
            >
              Use default
            </button>
          </div>
        </Card>
      ) : (
        <Card padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Deliver to</p>
              <p className="font-medium">{displayName ?? "Select a location"}</p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setIsChanging(true)}
            >
              Change
            </button>
          </div>
          {defaultLocationInactive && (
            <p className="mt-3 text-sm text-amber-800">
              Your saved default location is inactive. Choose an active location
              for this order.
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
