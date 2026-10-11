"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { selectClassName } from "@/components/ui/form-field";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { resolveLocationPickerConfirmation } from "@/lib/lunch-checkout-accessibility";
import { STAFF_PRIMARY_CTA_CLASS } from "@/lib/staff-visual-contrast";
import {
  formatOfficeLocationLabel,
  type OfficeLocationOption,
} from "@/lib/office-locations";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: OfficeLocationOption[];
  selectedLocationId: string;
  /** Applies the location (and default preference) only on explicit confirmation. */
  onConfirmLocation: (locationId: string, saveAsDefault: boolean) => void;
  /** Why the picker was opened (for example from Place Order); read as the dialog description. */
  notice?: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  initialDefaultLocationId: string;
  showSaveAsDefault: boolean;
  saveAsDefault: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
};

const subscribeToNothing = () => () => undefined;

export function OrderLocationPopover(props: Props) {
  // The modal portal target only exists on the client; rendering it while hydrating an
  // initially-open picker (no default location) causes a mismatch and an invisible dialog.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  if (!props.open || !hydrated) {
    return null;
  }

  return <OrderLocationPopoverDialog {...props} />;
}

function OrderLocationPopoverDialog({
  open,
  onOpenChange,
  locations,
  selectedLocationId,
  onConfirmLocation,
  notice = null,
  returnFocusRef,
  initialDefaultLocationId,
  showSaveAsDefault,
  saveAsDefault,
  anchorRef,
}: Props) {
  const selectId = useId();
  const labelId = `${selectId}-label`;
  const noticeId = `${selectId}-notice`;
  const errorId = `${selectId}-error`;
  const selectRef = useRef<HTMLSelectElement>(null);
  const [pendingLocationId, setPendingLocationId] = useState(selectedLocationId);
  const [pendingSaveAsDefault, setPendingSaveAsDefault] = useState(saveAsDefault);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // The dialog is anchored below the trigger; when opened from Place Order the trigger
  // may be scrolled out of view, which would leave the dialog off-screen.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      anchor.scrollIntoView({ block: "center" });
    }
  }, [anchorRef]);

  function confirm(locationId: string) {
    const result = resolveLocationPickerConfirmation(
      locationId,
      locations.map((location) => location.id),
    );

    if (!result.ok) {
      setSelectionError(result.message);
      selectRef.current?.focus();
      return;
    }

    const returnTarget = returnFocusRef?.current;
    onConfirmLocation(result.locationId, pendingSaveAsDefault);
    window.requestAnimationFrame(() => {
      if (returnTarget && returnTarget.isConnected) {
        returnTarget.focus();
        return;
      }
      anchorRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <FocusTrapPopover
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={anchorRef}
      returnFocusRef={returnFocusRef}
      labelId={labelId}
      describedById={notice ? noticeId : undefined}
      modal
      initialFocusRef={selectRef}
      className="w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-surface p-4 shadow-lg"
    >
      <p id={labelId} className="text-sm font-semibold text-slate-900">
        Delivery location
      </p>
      {notice ? (
        <p id={noticeId} className="mt-1 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}
      <label htmlFor={selectId} className="sr-only">
        Choose delivery location
      </label>
      <select
        ref={selectRef}
        id={selectId}
        value={pendingLocationId}
        aria-invalid={selectionError ? true : undefined}
        aria-describedby={selectionError ? errorId : undefined}
        onChange={(event) => {
          setPendingLocationId(event.target.value);
          setSelectionError(null);
        }}
        className={`${selectClassName} mt-3 w-full`}
      >
        {!pendingLocationId ? (
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
      {selectionError ? (
        <p id={errorId} className="mt-2 text-sm text-red-700">
          {selectionError}
        </p>
      ) : null}

      {showSaveAsDefault ? (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={pendingSaveAsDefault}
            onChange={(event) => setPendingSaveAsDefault(event.target.checked)}
            className="mt-1 size-4 shrink-0"
          />
          <span>Save as my default delivery location</span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${STAFF_PRIMARY_CTA_CLASS}`}
          onClick={() => confirm(pendingLocationId)}
        >
          Use this location
        </button>
        {initialDefaultLocationId.length > 0 ? (
          <button
            type="button"
            className="inline-flex min-h-10 items-center text-sm font-medium text-staff-teal hover:underline"
            onClick={() => confirm(initialDefaultLocationId)}
          >
            Use default
          </button>
        ) : null}
      </div>
    </FocusTrapPopover>
  );
}
