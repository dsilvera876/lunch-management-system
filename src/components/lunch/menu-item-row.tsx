"use client";

import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";

type Props = {
  name: string;
  unitLabel: string;
  price: number;
  selected: boolean;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
};

export const MENU_ITEM_TOGGLE_BASE_CLASS =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-base font-semibold leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40";

export const MENU_ITEM_TOGGLE_ADD_CLASS = `${MENU_ITEM_TOGGLE_BASE_CLASS} bg-primary text-white hover:bg-primary-hover`;
export const MENU_ITEM_TOGGLE_REMOVE_CLASS = `${MENU_ITEM_TOGGLE_BASE_CLASS} bg-primary/45 text-white hover:bg-primary/60`;

export function MenuItemRow({
  name,
  unitLabel,
  price,
  selected,
  disabled = false,
  onAdd,
  onRemove,
}: Props) {
  const label = formatMenuItemLabel(name, unitLabel);
  const priceLabel = price > 0 ? formatCurrency(price) : "Included";

  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{label}</p>
      </div>
      <p className="w-[5.5rem] shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
        {priceLabel}
      </p>
      {selected ? (
        <button
          type="button"
          disabled={disabled}
          title={`Remove ${label}`}
          aria-label={`Remove ${label}`}
          className={MENU_ITEM_TOGGLE_REMOVE_CLASS}
          onClick={onRemove}
        >
          −
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          title={`Add ${label}`}
          aria-label={`Add ${label}`}
          className={MENU_ITEM_TOGGLE_ADD_CLASS}
          onClick={onAdd}
        >
          +
        </button>
      )}
    </div>
  );
}
