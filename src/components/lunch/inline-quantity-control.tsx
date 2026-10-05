"use client";

type Props = {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
};

export function InlineQuantityControl({
  value,
  min = 1,
  max = 99,
  disabled = false,
  label,
  onChange,
}: Props) {
  function adjust(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    onChange(next);
  }

  const quantityAnnouncement = `Quantity ${value}`;

  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => adjust(-1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-lg font-medium text-foreground hover:bg-background disabled:border-border disabled:bg-slate-100 disabled:text-slate-400"
        aria-label={`Decrease quantity for ${label}`}
      >
        −
      </button>
      <span className="relative min-w-[2ch] text-center text-sm font-semibold tabular-nums">
        <span aria-hidden="true">{value}</span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {quantityAnnouncement}
        </span>
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => adjust(1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-lg font-medium text-foreground hover:bg-background disabled:border-border disabled:bg-slate-100 disabled:text-slate-400"
        aria-label={`Increase quantity for ${label}`}
      >
        +
      </button>
    </div>
  );
}
