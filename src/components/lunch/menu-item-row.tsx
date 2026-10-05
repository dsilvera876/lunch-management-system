"use client";

import type { KeyboardEvent } from "react";
import { IconCartPlus, IconCheck } from "@/components/icons/line-icons";
import { shouldBlockAriaDisabledActivation } from "@/lib/aria-disabled-activation";
import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";

type Props = {
  name: string;
  unitLabel: string;
  price: number;
  selected: boolean;
  disabled?: boolean;
  /** When true, Add stays focusable with aria-disabled until a main is chosen. */
  blockedUntilMainSelected?: boolean;
  blockedDescribedBy?: string;
  onAdd: () => void;
};

export const MENU_ITEM_TOGGLE_WIDTH_CLASS = "w-[7.25rem]";

export const MENU_ITEM_TOGGLE_LAYOUT_CLASS = `${MENU_ITEM_TOGGLE_WIDTH_CLASS} inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed`;

export const MENU_ITEM_TOGGLE_ADD_CLASS = `${MENU_ITEM_TOGGLE_LAYOUT_CLASS} border-primary bg-surface text-staff-teal hover:bg-primary/5`;

export const MENU_ITEM_TOGGLE_ADDED_CLASS = `${MENU_ITEM_TOGGLE_LAYOUT_CLASS} border-border bg-slate-100 text-slate-600`;

export function MenuItemRow({
  name,
  unitLabel,
  price,
  selected,
  disabled = false,
  blockedUntilMainSelected = false,
  blockedDescribedBy,
  onAdd,
}: Props) {
  const label = formatMenuItemLabel(name, unitLabel);
  const priceLabel = price > 0 ? formatCurrency(price) : "Included";
  const addBlocked = blockedUntilMainSelected && !selected;

  function handleAddClick() {
    if (addBlocked) {
      return;
    }
    onAdd();
  }

  function handleAddKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (shouldBlockAriaDisabledActivation(addBlocked, event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

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
          disabled
          aria-label={`${label} added to your order`}
          className={MENU_ITEM_TOGGLE_ADDED_CLASS}
        >
          <IconCheck size={16} aria-hidden />
          <span>Added</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled && !addBlocked}
          aria-disabled={addBlocked ? true : undefined}
          aria-describedby={addBlocked ? blockedDescribedBy : undefined}
          title={addBlocked ? undefined : `Add ${label}`}
          aria-label={`Add ${label}`}
          className={`${MENU_ITEM_TOGGLE_ADD_CLASS} ${addBlocked ? "cursor-not-allowed opacity-60" : ""}`}
          onClick={handleAddClick}
          onKeyDown={handleAddKeyDown}
        >
          <IconCartPlus size={16} aria-hidden />
          <span>Add</span>
        </button>
      )}
    </div>
  );
}
