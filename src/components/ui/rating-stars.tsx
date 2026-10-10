"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

export type RatingStarsSize = "sm" | "lg";

type Props = {
  value?: number;
  max?: number;
  size?: RatingStarsSize;
  readOnly?: boolean;
  disabled?: boolean;
  saving?: boolean;
  label?: string;
  /** Called when the user commits a rating (click, Enter, or Space on a star). */
  onCommit?: (value: number) => void;
};

const STAR_PX: Record<RatingStarsSize, number> = {
  sm: 16,
  lg: 30,
};

function StarGlyph({
  filled,
  highlighted,
  size,
}: {
  filled: boolean;
  highlighted: boolean;
  size: RatingStarsSize;
}) {
  const px = STAR_PX[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden
      className={`transition-colors ${
        filled
          ? highlighted
            ? "text-primary drop-shadow-[0_0_0.5px_currentColor]"
            : "text-primary"
          : "text-teal-700/25"
      }`}
    >
      <path
        d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RatingStars({
  value = 0,
  max = 5,
  size = "sm",
  readOnly = true,
  disabled = false,
  saving = false,
  label = "Rating",
  onCommit,
}: Props) {
  const groupId = useId();
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [focusValue, setFocusValue] = useState<number | null>(null);

  const interactive = !readOnly && Boolean(onCommit) && !disabled;
  const previewValue = hoverValue ?? focusValue;
  const displayValue = previewValue ?? value;
  const isPreviewing = previewValue != null && previewValue !== value;
  const groupAriaValueText =
    isPreviewing && value > 0
      ? `Previewing ${previewValue} of ${max} stars. Saved rating ${value} of ${max} stars.`
      : isPreviewing && value === 0
        ? `Previewing ${previewValue} of ${max} stars.`
        : value > 0
          ? `${value} of ${max} stars`
          : undefined;

  function clearPreview() {
    setHoverValue(null);
    setFocusValue(null);
  }

  function handlePointerLeave(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) {
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setHoverValue(null);
  }

  function handleCommit(starValue: number) {
    if (!interactive) {
      return;
    }
    clearPreview();
    onCommit?.(starValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, starValue: number) {
    if (!interactive || saving) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCommit(starValue);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(max, starValue + 1);
      setFocusValue(next);
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-star-value="${next}"]`)
        ?.focus();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.max(1, starValue - 1);
      setFocusValue(next);
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-star-value="${next}"]`)
        ?.focus();
    }
  }

  const touchTargetClass =
    size === "lg"
      ? "min-h-11 min-w-11 p-1.5"
      : "min-h-8 min-w-8 p-0.5";

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${saving ? "opacity-80" : ""}`}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={readOnly ? `${label}: ${value} of ${max} stars` : label}
      aria-disabled={disabled || saving || undefined}
      aria-busy={saving || undefined}
      data-rating-stars-value={value}
      data-rating-stars-preview={previewValue ?? ""}
      onPointerLeave={interactive ? handlePointerLeave : undefined}
    >
      {groupAriaValueText && !readOnly ? (
        <span className="sr-only" aria-live="polite">
          {groupAriaValueText}
        </span>
      ) : null}
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const filled = starValue <= displayValue;
        const highlighted =
          isPreviewing &&
          starValue <= displayValue &&
          starValue > Math.min(value, previewValue ?? value);

        if (readOnly) {
          return (
            <span key={starValue} className="inline-flex">
              <StarGlyph filled={filled} highlighted={false} size={size} />
            </span>
          );
        }

        const checked = value === starValue;

        return (
          <button
            key={starValue}
            id={`${groupId}-star-${starValue}`}
            type="button"
            data-star-value={starValue}
            disabled={disabled}
            className={`inline-flex items-center justify-center rounded-md outline-none transition-[opacity,transform] hover:scale-105 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${touchTargetClass}`}
            onPointerEnter={() => {
              if (!interactive) {
                return;
              }
              setHoverValue(starValue);
            }}
            onFocus={() => {
              if (!interactive) {
                return;
              }
              setFocusValue(starValue);
            }}
            onBlur={() => {
              setFocusValue((current) => (current === starValue ? null : current));
            }}
            onClick={() => handleCommit(starValue)}
            onKeyDown={(event) => handleKeyDown(event, starValue)}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            aria-checked={checked}
            role="radio"
            tabIndex={value > 0 ? (starValue === value ? 0 : -1) : starValue === 1 ? 0 : -1}
          >
            <StarGlyph filled={filled} highlighted={highlighted || (isPreviewing && filled)} size={size} />
          </button>
        );
      })}
    </div>
  );
}

const STAR_PATH =
  "m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7z";

type AverageProps = {
  value: number;
  max?: number;
  size?: RatingStarsSize;
  label?: string;
};

/** Read-only fractional average (e.g. 3.7 of 5) for HR summaries. */
export function RatingStarsAverage({
  value,
  max = 5,
  size = "sm",
  label,
}: AverageProps) {
  const clipPrefix = useId().replace(/:/g, "");
  const px = STAR_PX[size];
  const clamped = Math.max(0, Math.min(max, value));
  const ariaLabel =
    label ??
    (clamped > 0
      ? `${clamped.toFixed(1)} out of ${max} stars average`
      : `No rating (${max}-star scale)`);

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={ariaLabel}
    >
      {Array.from({ length: max }, (_, index) => {
        const starIndex = index + 1;
        const fillAmount = Math.max(0, Math.min(1, clamped - index));
        const clipId = `${clipPrefix}-star-${starIndex}`;

        return (
          <svg
            key={starIndex}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            aria-hidden
            className="text-teal-700/25"
          >
            <path
              d={STAR_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {fillAmount > 0 ? (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <rect x="0" y="0" width={24 * fillAmount} height="24" />
                  </clipPath>
                </defs>
                <path
                  d={STAR_PATH}
                  fill="currentColor"
                  className="text-primary"
                  clipPath={`url(#${clipId})`}
                />
              </>
            ) : null}
          </svg>
        );
      })}
    </div>
  );
}
