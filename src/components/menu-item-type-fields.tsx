"use client";

import { useState } from "react";
import {
  DEFAULT_UNIT_LABEL,
  DISPLAY_CATEGORIES,
  MENU_ITEM_TYPES,
  normalizeDisplayCategory,
  type MenuItemType,
} from "@/lib/menu-items";
import { ITEM_TYPE_FIELD_HINTS } from "@/lib/manage-menu-form";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";

type Props = {
  defaultItemType?: string;
  defaultUnitLabel?: string;
  defaultDisplayCategory?: string;
  itemTypeId?: string;
  unitLabelId?: string;
  displayCategoryId?: string;
};

export function MenuItemTypeFields({
  defaultItemType = "standalone",
  defaultUnitLabel = DEFAULT_UNIT_LABEL,
  defaultDisplayCategory = "",
  itemTypeId = "itemType",
  unitLabelId = "unitLabel",
  displayCategoryId = "displayCategory",
}: Props) {
  const normalizedDefaultCategory =
    normalizeDisplayCategory(defaultDisplayCategory) ?? "";

  const [itemType, setItemType] = useState(defaultItemType);
  const hint =
    ITEM_TYPE_FIELD_HINTS[itemType as MenuItemType] ??
    ITEM_TYPE_FIELD_HINTS.standalone;

  return (
    <>
      <FormField label="Item type" htmlFor={itemTypeId}>
        <select
          id={itemTypeId}
          name="itemType"
          value={itemType}
          onChange={(event) => setItemType(event.target.value)}
          required
          className={selectClassName}
        >
          {MENU_ITEM_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </FormField>

      <FormField label="Selling unit" htmlFor={unitLabelId}>
        <input
          id={unitLabelId}
          name="unitLabel"
          defaultValue={defaultUnitLabel}
          required
          maxLength={40}
          placeholder="Each, Bottle, 1/4 LB, 1 LB"
          className={inputClassName}
        />
        <p className="mt-0.5 text-xs text-muted">
          Price is per unit; e.g. 4 × ¼ LB = four units.
        </p>
      </FormField>

      <FormField label="Display category (Optional)" htmlFor={displayCategoryId}>
        <select
          id={displayCategoryId}
          name="displayCategory"
          defaultValue={normalizedDefaultCategory}
          className={selectClassName}
        >
          <option value="">No category</option>
          {DISPLAY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </FormField>
    </>
  );
}
