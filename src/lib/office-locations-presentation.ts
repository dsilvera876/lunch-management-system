import type { OfficeLocation } from "@/lib/office-locations";
import { OFFICE_LOCATION_IN_USE_DELETION_MESSAGE } from "@/lib/unused-record-deletion";

export type OfficeLocationRecord = OfficeLocation;

export type OfficeLocationMutationError =
  | "invalid"
  | "duplicate"
  | "create"
  | "update"
  | "status";

export type OfficeLocationDeleteError =
  | "invalid"
  | "in-use"
  | "unauthorized"
  | "delete";

export const OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS = 4500;

export const OFFICE_LOCATIONS_TOAST = {
  created: "Location created.",
  updated: "Location updated.",
  activated: "Location activated.",
  deactivated: "Location deactivated.",
  deleted: "Location deleted permanently.",
} as const;

export function mergeOfficeLocation(
  locations: OfficeLocationRecord[],
  location: OfficeLocationRecord,
): OfficeLocationRecord[] {
  const index = locations.findIndex((row) => row.id === location.id);

  if (index === -1) {
    return [...locations, location].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  const next = [...locations];
  next[index] = location;
  return next.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function removeOfficeLocation(
  locations: OfficeLocationRecord[],
  locationId: string,
): OfficeLocationRecord[] {
  return locations.filter((row) => row.id !== locationId);
}

export function officeLocationMutationErrorMessage(
  error: OfficeLocationMutationError,
  mode: "add" | "edit",
): string {
  switch (error) {
    case "duplicate":
      return "An office location with that name already exists.";
    case "invalid":
      return "Check the location fields and try again.";
    default:
      return mode === "add"
        ? "Unable to create this location."
        : "Unable to save this location.";
  }
}

export function officeLocationDeleteErrorMessage(
  error: OfficeLocationDeleteError,
): string {
  switch (error) {
    case "in-use":
      return OFFICE_LOCATION_IN_USE_DELETION_MESSAGE;
    case "unauthorized":
      return "You are not authorized to delete office locations.";
    case "invalid":
      return "Unable to delete this office location.";
    default:
      return "Unable to delete this office location.";
  }
}

export function isOfficeLocationDeleteBlockedMessage(message: string): boolean {
  return message.includes("already in use");
}
