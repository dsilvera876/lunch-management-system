import type { MenuItemRatingSummary } from "@/lib/menu-item-ratings";

export function menuItemRatingStatusMessage(
  summary: MenuItemRatingSummary | undefined,
  savedMessage: string | null,
): string | null {
  if (savedMessage) {
    return savedMessage;
  }

  if (!summary) {
    return null;
  }

  if (summary.myStars != null) {
    return `Your rating: ${summary.myStars} of 5 stars`;
  }

  if (summary.canSubmitOrUpdate) {
    return "Select stars to rate this item.";
  }

  return null;
}
