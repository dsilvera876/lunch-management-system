import { isValidProviderOrderEmail } from "@/lib/late-orders";

export { isValidProviderOrderEmail };

export const PROVIDER_ORDER_EMAIL_HELPER =
  "Daily lunch orders and any late-order supplements are sent to this address.";

export const ACTIVATE_PROVIDER_EMAIL_REQUIRED_MESSAGE =
  "Add a provider order email before activating this provider.";

export type ProviderOrderEmailValidationError = "missing" | "invalid";

export function normalizeProviderOrderEmail(
  value: FormDataEntryValue | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateProviderOrderEmailForActiveProvider(
  active: boolean,
  email: string | null,
): ProviderOrderEmailValidationError | null {
  if (!active) {
    return null;
  }

  if (!email) {
    return "missing";
  }

  if (!isValidProviderOrderEmail(email)) {
    return "invalid";
  }

  return null;
}
