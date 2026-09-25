export const PROVIDER_SUCCESS_TOAST_DURATION_MS = 4500;

export const PROVIDER_SUCCESS_TOAST = {
  created: "Provider created.",
  updated: "Provider settings saved.",
  statusUpdated: "Provider status updated.",
  lateUpdated: "Late-order settings saved.",
  deleted: "Provider deleted permanently.",
} as const;

export type ProviderEditFlashSuccess = "updated" | "statusUpdated" | "lateUpdated";

export function providerEditFlashToastTitle(flash: ProviderEditFlashSuccess): string {
  switch (flash) {
    case "updated":
      return PROVIDER_SUCCESS_TOAST.updated;
    case "statusUpdated":
      return PROVIDER_SUCCESS_TOAST.statusUpdated;
    default:
      return PROVIDER_SUCCESS_TOAST.lateUpdated;
  }
}
