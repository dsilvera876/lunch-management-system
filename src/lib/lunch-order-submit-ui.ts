import { formatHumanDate } from "@/lib/format";
import { emptyProviderDraft, type ProviderDraft } from "@/lib/lunch-order-draft";

export function clearSubmittedProviderDraft(
  drafts: Record<string, ProviderDraft>,
  providerId: string,
): Record<string, ProviderDraft> {
  return {
    ...drafts,
    [providerId]: emptyProviderDraft(),
  };
}

export function buildOrderPlacedToastBody(
  providerName: string,
  deliveryDate: string | null,
): string {
  const deliveryLabel = deliveryDate ? formatHumanDate(deliveryDate) : "the next delivery";
  return `Your order from ${providerName} was submitted for ${deliveryLabel}.`;
}
