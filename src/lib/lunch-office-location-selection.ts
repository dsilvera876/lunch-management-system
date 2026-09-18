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
