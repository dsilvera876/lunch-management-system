import type { OfficeLocationOption } from "@/lib/office-locations";

export function resolveInitialOfficeLocationId(
  locations: OfficeLocationOption[],
  defaultLocationId: string | null,
  defaultLocationInactive: boolean,
): string {
  if (!defaultLocationId) {
    return "";
  }

  if (defaultLocationInactive) {
    return "";
  }

  if (locations.some((location) => location.id === defaultLocationId)) {
    return defaultLocationId;
  }

  return "";
}

/** Persist default when confirming delivery location on /lunch (not deferred to checkout). */
export function shouldPersistDefaultOnLocationConfirm(
  saveAsDefault: boolean,
  savedDefaultOfficeLocationId: string | null,
  selectedOfficeLocationId: string,
): boolean {
  if (!saveAsDefault || selectedOfficeLocationId.length === 0) {
    return false;
  }

  if (savedDefaultOfficeLocationId === null) {
    return true;
  }

  return selectedOfficeLocationId !== savedDefaultOfficeLocationId;
}

export function getOfficeLocationDisplayName(
  locations: OfficeLocationOption[],
  selectedLocationId: string,
  fallbackName?: string | null,
): string | null {
  if (!selectedLocationId) {
    return fallbackName ?? null;
  }

  const selected = locations.find((location) => location.id === selectedLocationId);
  return selected?.name ?? fallbackName ?? null;
}
