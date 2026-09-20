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

export function buildCheckoutSuccessToastBody(
  orderCount: number,
  providerCount: number,
  deliveryDate: string | null,
): string {
  const deliveryLabel = deliveryDate ? formatHumanDate(deliveryDate) : "the next delivery";
  const orderLabel =
    orderCount === 1 ? "1 lunch order" : `${orderCount} lunch orders`;
  const providerLabel =
    providerCount === 1 ? "1 provider" : `${providerCount} providers`;

  return `${orderLabel} from ${providerLabel} were submitted for ${deliveryLabel}.`;
}
