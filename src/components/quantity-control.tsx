"use client";

import { useId, useState } from "react";
import { parseOrderQuantity } from "@/lib/ordering-ui";
import { formatCurrency } from "@/lib/format";

type Props = {
  id: string;
  name: string;
  label: string;
  price: number | string;
  defaultValue?: number;
  onQuantityChange?: (quantity: number) => void;
};

export function QuantityControl({
  id,
  name,
  label,
  price,
  defaultValue = 0,
  onQuantityChange,
}: Props) {
  const hintId = useId();
  const [quantity, setQuantity] = useState(() => parseOrderQuantity(defaultValue));
  const [inputValue, setInputValue] = useState(String(parseOrderQuantity(defaultValue)));

  function updateQuantity(next: number) {
    const clamped = Math.max(0, Math.floor(next));
    setQuantity(clamped);
    setInputValue(String(clamped));
    onQuantityChange?.(clamped);
  }

  function handleInputChange(value: string) {
    setInputValue(value);

    if (value.trim() === "") {
      setQuantity(0);
      onQuantityChange?.(0);
      return;
    }

    const parsed = parseOrderQuantity(value);

    if (Number.isFinite(Number(value))) {
      setQuantity(parsed);
      onQuantityChange?.(parsed);
    }
  }

  function handleBlur() {
    const parsed = parseOrderQuantity(inputValue);
    updateQuantity(parsed);
  }

  const subtotal = quantity > 0 ? Number(price) * quantity : 0;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            aria-label={`Decrease quantity for ${label}`}
            disabled={quantity <= 0}
            onClick={() => updateQuantity(quantity - 1)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-l-lg border-r border-border text-lg font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <input
            id={id}
            name={name}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={inputValue}
            onChange={(event) => handleInputChange(event.target.value)}
            onBlur={handleBlur}
            aria-describedby={hintId}
            className="h-10 w-14 border-0 bg-transparent text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label={`Increase quantity for ${label}`}
            onClick={() => updateQuantity(quantity + 1)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-r-lg border-l border-border text-lg font-medium transition-colors hover:bg-slate-50"
          >
            +
          </button>
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted sm:text-right">
        {quantity > 0
          ? `Subtotal: ${formatCurrency(subtotal)}`
          : "Set quantity to include this item"}
      </p>
    </div>
  );
}
