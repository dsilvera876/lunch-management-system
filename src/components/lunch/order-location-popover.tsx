"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { selectClassName } from "@/components/ui/form-field";
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
  defaultLocationId: string | null;
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
  defaultLocationId,
  initialDefaultLocationId,
  showSaveAsDefault,
  saveAsDefault,
  onSaveAsDefaultChange,
  anchorRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        anchorRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, anchorRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${selectId}-label`}
      className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-surface p-4 shadow-lg"
    >
      <p id={`${selectId}-label`} className="text-sm font-semibold text-slate-900">
        Delivery location
      </p>
      <label htmlFor={selectId} className="sr-only">
        Choose delivery location
      </label>
      <select
        id={selectId}
        value={selectedLocationId}
        onChange={(event) => {
          onSelectLocation(event.target.value);
        }}
        className={`${selectClassName} mt-3 w-full`}
        autoFocus
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
          className="mt-3 text-sm font-medium text-primary hover:underline"
          onClick={() => {
            onSelectLocation(initialDefaultLocationId);
          }}
        >
          Use default
        </button>
      ) : null}

      {showSaveAsDefault && defaultLocationId === null ? (
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
    </div>
  );
}
