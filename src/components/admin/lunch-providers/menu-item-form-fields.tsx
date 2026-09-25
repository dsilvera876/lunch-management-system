import { MenuItemTypeFields } from "@/components/menu-item-type-fields";
import { WeekdayPicker } from "@/components/weekday-picker";
import type { ManageMenuItemRecord } from "@/lib/lunch-providers-presentation";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";

type Props = {
  idPrefix: string;
  item?: ManageMenuItemRecord;
  weekdayDefaults?: number[];
};

export function MenuItemFormFields({
  idPrefix,
  item,
  weekdayDefaults,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <FormField label="Name" htmlFor={`${idPrefix}-name`}>
          <input
            id={`${idPrefix}-name`}
            name="name"
            defaultValue={item?.name}
            required
            className={inputClassName}
          />
        </FormField>

        <FormField label="Description" htmlFor={`${idPrefix}-description`}>
          <textarea
            id={`${idPrefix}-description`}
            name="description"
            rows={2}
            defaultValue={item?.description ?? ""}
            className={textareaClassName}
          />
        </FormField>
      </div>

      <div className="space-y-3 rounded-xl border border-border/80 bg-slate-50/40 p-3">
        <FormField label="Price" htmlFor={`${idPrefix}-price`}>
          <input
            id={`${idPrefix}-price`}
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={item ? Number(item.price) : undefined}
            required
            className={inputClassName}
          />
        </FormField>

        <MenuItemTypeFields
          defaultItemType={item?.itemType}
          defaultUnitLabel={item?.unitLabel}
          defaultDisplayCategory={item?.displayCategory ?? ""}
          itemTypeId={item ? `itemType-${item.id}` : "itemType"}
          unitLabelId={item ? `unitLabel-${item.id}` : "unitLabel"}
          displayCategoryId={item ? `displayCategory-${item.id}` : "displayCategory"}
        />
      </div>

      <div className="rounded-xl border border-border/80 bg-slate-50/40 p-3">
        <WeekdayPicker
          defaultWeekdays={weekdayDefaults ?? item?.weekdays}
          legend="Available on"
          showDescription={false}
        />
      </div>
    </div>
  );
}
