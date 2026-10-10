"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveMyMenuItemRating } from "@/app/menu-item-ratings/actions";
import { RatingStars, type RatingStarsSize } from "@/components/ui/rating-stars";
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
  starSize?: RatingStarsSize;
  /** Dashboard recent meals: stars + screen-reader status only. */
  presentation?: "default" | "dashboardRecent";
};

export function MenuItemRatingBlock({
  providerMenuItemId,
  itemName,
  initialSummary,
  ratingsEnabled,
  summariesLoadFailed = false,
  compact = false,
  starSize = "lg",
  presentation = "default",
}: Props) {
  const isDashboardRecent = presentation === "dashboardRecent";
  const statusId = useId();
  const saveGenerationRef = useRef(0);
  const queuedStarsRef = useRef<number | null>(null);
  const drainActiveRef = useRef(false);
  const [summary, setSummary] = useState(initialSummary);
  const [optimisticStars, setOptimisticStars] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Sync server-refreshed summaries after save/reload without remounting the block.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop-to-state sync
    setSummary(initialSummary);
    if (!summariesLoadFailed) {
      setErrorMessage(null);
    }
    if (!drainActiveRef.current && queuedStarsRef.current === null) {
      setOptimisticStars(null);
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

  const confirmedStars = summary?.myStars ?? 0;
  const displayValue = optimisticStars ?? confirmedStars;
  const canRate = !summariesLoadFailed && summary?.canSubmitOrUpdate === true;

  const statusMessage =
    errorMessage ??
    menuItemRatingStatusMessage(summary, savedMessage, {
      savedRatingPrefix: isDashboardRecent ? "Rated" : "Your rating",
    });

  function drainSaveQueue() {
    if (drainActiveRef.current) {
      return;
    }

    drainActiveRef.current = true;

    startTransition(async () => {
      try {
        while (queuedStarsRef.current !== null) {
          const stars = queuedStarsRef.current;
          queuedStarsRef.current = null;
          const generation = ++saveGenerationRef.current;

          const result = await saveMyMenuItemRating(providerMenuItemId, stars);

          if (generation !== saveGenerationRef.current) {
            continue;
          }

          if (!result.ok) {
            setOptimisticStars(null);
            setErrorMessage(result.message);
            return;
          }

          setErrorMessage(null);
          setSummary(result.summary);
          const nextQueued = queuedStarsRef.current;
          setOptimisticStars(nextQueued);

          if (nextQueued === null) {
            setSavedMessage(
              result.refreshWarning
                ? `${result.refreshWarning} (${stars} of 5 stars saved for ${itemName}.)`
                : `Saved ${stars} of 5 stars for ${itemName}.`,
            );
          }
        }
      } finally {
        drainActiveRef.current = false;
        if (queuedStarsRef.current !== null) {
          drainSaveQueue();
        }
      }
    });
  }

  function handleCommit(stars: number) {
    if (!canRate) {
      return;
    }

    setErrorMessage(null);
    setSavedMessage(null);
    setOptimisticStars(stars);
    queuedStarsRef.current = stars;
    drainSaveQueue();
  }

  const instructionalFallback =
    !isDashboardRecent && summary?.myStars == null && !summary?.canSubmitOrUpdate
      ? "Rate this item after your order is verified as delivered."
      : null;

  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-2 space-y-2"}>
      {!isDashboardRecent && communityLabel ? (
        <p className="text-xs text-staff-instruction">{communityLabel}</p>
      ) : null}

      {summariesLoadFailed ? (
        <p className="text-xs text-destructive" role="alert">
          Ratings unavailable right now.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!isDashboardRecent ? (
              <span className="text-xs font-medium text-slate-700">Your rating</span>
            ) : null}
            <RatingStars
              value={displayValue}
              size={starSize}
              readOnly={!canRate}
              disabled={!summary?.canSubmitOrUpdate}
              saving={isPending}
              label={
                isDashboardRecent ? `Rate ${itemName}` : `Your rating for ${itemName}`
              }
              onCommit={canRate ? handleCommit : undefined}
            />
            {isPending ? (
              <span
                className={
                  isDashboardRecent
                    ? "sr-only"
                    : "text-xs text-staff-instruction"
                }
                aria-live="polite"
              >
                Saving…
              </span>
            ) : null}
          </div>

          <p
            id={statusId}
            className={`text-xs ${
              errorMessage
                ? "text-destructive"
                : isDashboardRecent
                  ? "sr-only"
                  : "text-staff-instruction"
            }`}
            role={errorMessage ? "alert" : "status"}
            aria-live="polite"
          >
            {errorMessage ?? statusMessage ?? instructionalFallback}
          </p>
        </>
      )}
    </div>
  );
}
