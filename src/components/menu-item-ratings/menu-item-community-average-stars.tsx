"use client";

import { RatingStarsAverage } from "@/components/ui/rating-stars";
import {
  formatCommunityRatingLabel,
  type MenuItemRatingSummary,
} from "@/lib/menu-item-ratings";

type Props = {
  itemName: string;
  summary: MenuItemRatingSummary;
};

/** Compact read-only community average for Staff menu browsing (main items only). */
export function MenuItemCommunityAverageStars({ itemName, summary }: Props) {
  if (summary.ratingCount <= 0) {
    return null;
  }

  return (
    <RatingStarsAverage
      value={summary.averageStars}
      size="sm"
      label={`${itemName}: ${formatCommunityRatingLabel(summary)}`}
    />
  );
}
