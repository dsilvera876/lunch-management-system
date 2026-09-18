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

  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => adjust(-1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-lg font-medium text-foreground hover:bg-background disabled:opacity-40"
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => adjust(1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-lg font-medium text-foreground hover:bg-background disabled:opacity-40"
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
