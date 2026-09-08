import {
  DEFAULT_UNIT_LABEL,
  DISPLAY_CATEGORIES,
  MENU_ITEM_TYPES,
  normalizeDisplayCategory,
} from "@/lib/menu-items";
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

  return (
    <>
      <FormField label="Item type" htmlFor={itemTypeId}>
        <select
          id={itemTypeId}
          name="itemType"
          defaultValue={defaultItemType}
          required
          className={selectClassName}
        >
          {MENU_ITEM_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          {MENU_ITEM_TYPES.find((type) => type.value === defaultItemType)?.description}
        </p>
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
        <p className="mt-1 text-xs text-muted">
          Price is per unit. Example: quantity 4 at 1/4 LB means four quarter-pound units.
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
        <p className="mt-1 text-xs text-muted">
          No category is stored as unset. “Other” is a distinct category.
          Ignored for mains and sides.
        </p>
      </FormField>
    </>
  );
}
