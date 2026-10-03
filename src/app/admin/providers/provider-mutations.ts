import {
  isValidProviderOrderEmail,
  normalizeProviderOrderEmail,
  validateProviderOrderEmailForActiveProvider,
} from "@/lib/provider-order-email";

export function parseProviderOrderEmailFromForm(formData: FormData): string | null {
  return normalizeProviderOrderEmail(formData.get("primaryOrderEmail"));
}

export function providerOrderEmailRedirectError(
  validation: ReturnType<typeof validateProviderOrderEmailForActiveProvider>,
): "provider-email" | "provider-email-required" | null {
  if (validation === "missing") {
    return "provider-email-required";
  }
  if (validation === "invalid") {
    return "provider-email";
  }
  return null;
}

export function readProviderActiveFromForm(formData: FormData, defaultActive = true): boolean {
  const value = formData.get("active");
  if (value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  return defaultActive;
}

export function validateProviderOrderEmailInput(
  active: boolean,
  email: string | null,
): "provider-email" | "provider-email-required" | null {
  return providerOrderEmailRedirectError(validateProviderOrderEmailForActiveProvider(active, email));
}

export function mapProviderOrderEmailDbError(message: string): "provider-email" | "provider-email-required" | null {
  if (message.includes("Invalid provider order email")) {
    return "provider-email";
  }
  if (message.includes("Active providers require a provider order email")) {
    return "provider-email-required";
  }
  return null;
}

export { isValidProviderOrderEmail };
