"use client";

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
  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={readOnly ? "img" : "radiogroup"}
      aria-label={readOnly ? `${label}: ${value} of ${max} stars` : label}
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
            className="inline-flex rounded p-0.5 transition-opacity hover:opacity-80"
            onClick={() => onChange?.(starValue)}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
          >
            <StarGlyph filled={filled} />
          </button>
        );
      })}
    </div>
  );
}
