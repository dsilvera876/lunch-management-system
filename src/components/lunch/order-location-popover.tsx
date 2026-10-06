"use client";

import { useId, useRef, type RefObject } from "react";
import { selectClassName } from "@/components/ui/form-field";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import {
  formatOfficeLocationLabel,
  type OfficeLocationOption,
} from "@/lib/office-locations";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: OfficeLocationOption[];
  selectedLocationId: string;
  onSelectLocation: (locationId: string) => void;
  initialDefaultLocationId: string;
  showSaveAsDefault: boolean;
  saveAsDefault: boolean;
  onSaveAsDefaultChange: (value: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
};

export function OrderLocationPopover({
  open,
  onOpenChange,
  locations,
  selectedLocationId,
  onSelectLocation,
  initialDefaultLocationId,
  showSaveAsDefault,
  saveAsDefault,
  onSaveAsDefaultChange,
  anchorRef,
}: Props) {
  const selectId = useId();
  const labelId = `${selectId}-label`;
  const selectRef = useRef<HTMLSelectElement>(null);

  return (
    <FocusTrapPopover
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={anchorRef}
      labelId={labelId}
      modal
      initialFocusRef={selectRef}
      className="w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-surface p-4 shadow-lg"
    >
      <p id={labelId} className="text-sm font-semibold text-slate-900">
        Delivery location
      </p>
      <label htmlFor={selectId} className="sr-only">
        Choose delivery location
      </label>
      <select
        ref={selectRef}
        id={selectId}
        value={selectedLocationId}
        onChange={(event) => {
          onSelectLocation(event.target.value);
        }}
        className={`${selectClassName} mt-3 w-full`}
      >
        {!selectedLocationId ? (
          <option value="" disabled>
            Select a location
          </option>
        ) : null}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {formatOfficeLocationLabel(location.name, location.address)}
          </option>
        ))}
      </select>

      {initialDefaultLocationId.length > 0 ? (
        <button
          type="button"
          className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-staff-teal hover:underline"
          onClick={() => {
            onSelectLocation(initialDefaultLocationId);
          }}
        >
          Use default
        </button>
      ) : null}

      {showSaveAsDefault ? (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(event) => onSaveAsDefaultChange(event.target.checked)}
            className="mt-1 size-4 shrink-0"
          />
          <span>Save as my default delivery location</span>
        </label>
      ) : null}
    </FocusTrapPopover>
  );
}
