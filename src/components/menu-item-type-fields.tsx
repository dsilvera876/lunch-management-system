import { MENU_ITEM_TYPES, DEFAULT_UNIT_LABEL } from "@/lib/menu-items";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";

type Props = {
  defaultItemType?: string;
  defaultUnitLabel?: string;
  itemTypeId?: string;
  unitLabelId?: string;
};

export function MenuItemTypeFields({
  defaultItemType = "standalone",
  defaultUnitLabel = DEFAULT_UNIT_LABEL,
  itemTypeId = "itemType",
  unitLabelId = "unitLabel",
}: Props) {
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
    </>
  );
}
