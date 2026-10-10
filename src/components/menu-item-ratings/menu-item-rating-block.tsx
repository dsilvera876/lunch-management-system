"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { saveMyMenuItemRating } from "@/app/menu-item-ratings/actions";
import { RatingStars } from "@/components/ui/rating-stars";
import {
  formatCommunityRatingLabel,
  type MenuItemRatingSummary,
} from "@/lib/menu-item-ratings";
import { menuItemRatingStatusMessage } from "@/lib/menu-item-ratings-presentation";

type Props = {
  providerMenuItemId: string;
  itemName: string;
  initialSummary?: MenuItemRatingSummary;
  /** When false, hide all rating UI (provider disabled). */
  ratingsEnabled: boolean;
  /** When true, summaries failed to load (distinct from “no ratings yet”). */
  summariesLoadFailed?: boolean;
  compact?: boolean;
};

export function MenuItemRatingBlock({
  providerMenuItemId,
  itemName,
  initialSummary,
  ratingsEnabled,
  summariesLoadFailed = false,
  compact = false,
}: Props) {
  const statusId = useId();
  const [summary, setSummary] = useState(initialSummary);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSummary(initialSummary);
    if (!summariesLoadFailed) {
      setErrorMessage(null);
    }
  }, [initialSummary, summariesLoadFailed]);

  if (!ratingsEnabled) {
    return null;
  }

  const communityLabel = summariesLoadFailed
    ? null
    : summary
      ? formatCommunityRatingLabel(summary)
      : "No ratings yet";

  const statusMessage = errorMessage ?? menuItemRatingStatusMessage(summary, savedMessage);
  const interactive =
    !summariesLoadFailed && summary?.canSubmitOrUpdate === true && !isPending;
  const displayValue = summary?.myStars ?? 0;

  function handleRate(stars: number) {
    if (!interactive) {
      return;
    }

    setErrorMessage(null);
    setSavedMessage(null);

    startTransition(async () => {
      const result = await saveMyMenuItemRating(providerMenuItemId, stars);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setSummary(result.summary);
      setSavedMessage(
        result.refreshWarning
          ? `${result.refreshWarning} (${stars} of 5 stars saved for ${itemName}.)`
          : `Saved ${stars} of 5 stars for ${itemName}.`,
      );
    });
  }

  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-2 space-y-2"}>
      {communityLabel ? (
        <p className="text-xs text-staff-instruction">{communityLabel}</p>
      ) : null}

      {summariesLoadFailed ? (
        <p className="text-xs text-destructive" role="alert">
          Ratings unavailable right now.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-medium text-slate-700">Your rating</span>
            <RatingStars
              value={displayValue}
              readOnly={!interactive}
              label={`Your rating for ${itemName}`}
              onChange={handleRate}
            />
            {isPending ? (
              <span className="text-xs text-staff-instruction" aria-live="polite">
                Saving…
              </span>
            ) : null}
          </div>

          <p
            id={statusId}
            className={`text-xs ${errorMessage ? "text-destructive" : "text-staff-instruction"}`}
            role="status"
            aria-live="polite"
          >
            {statusMessage ?? (summary?.myStars == null && !summary?.canSubmitOrUpdate
              ? "Rate this item after your order is verified as delivered."
              : null)}
          </p>
        </>
      )}
    </div>
  );
}
