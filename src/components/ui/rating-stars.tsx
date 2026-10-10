"use client";

import type { KeyboardEvent } from "react";

type Props = {
  value?: number;
  max?: number;
  readOnly?: boolean;
  label?: string;
  onChange?: (value: number) => void;
};

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden
      className={filled ? "text-primary" : "text-teal-700/25"}
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
  readOnly = true,
  label = "Rating",
  onChange,
}: Props) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly || !onChange) {
      return;
    }

    let next = value > 0 ? value : 1;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      next = Math.min(max, (value > 0 ? value : 0) + 1);
      onChange(next);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      next = Math.max(1, (value > 0 ? value : 2) - 1);
      onChange(next);
    }
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      role={readOnly ? "img" : "radiogroup"}
      aria-label={readOnly ? `${label}: ${value} of ${max} stars` : label}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : handleKeyDown}
    >
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const filled = starValue <= value;

        if (readOnly) {
          return (
            <span key={starValue} className="inline-flex">
              <StarGlyph filled={filled} />
            </span>
          );
        }

        return (
          <button
            key={starValue}
            type="button"
            className="inline-flex min-h-6 min-w-6 items-center justify-center rounded p-0.5 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => onChange?.(starValue)}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            aria-checked={value === starValue}
            role="radio"
          >
            <StarGlyph filled={filled} />
          </button>
        );
      })}
    </div>
  );
}
