import { isValidSpecialInstructions } from "@/lib/menu-items";
import type { CheckoutProviderEntry } from "@/lib/lunch-checkout";

export function getCheckoutGlobalGuidanceMessage(
  entries: CheckoutProviderEntry[],
): string | null {
  for (const entry of entries) {
    if (!isValidSpecialInstructions(entry.draft.specialInstructions)) {
      return `${entry.providerName}: Special instructions must be 500 characters or fewer.`;
    }

    if (!entry.validation.valid) {
      if (entry.validation.mealIncomplete) {
        continue;
      }

      return `${entry.providerName}: ${entry.validation.message ?? "Complete this provider order."}`;
    }
  }

  return null;
}
