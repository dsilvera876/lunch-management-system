import { formatWeekdayList } from "@/lib/datetime";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { linkButtonClass } from "@/components/ui/button";
import { WeekdayPicker } from "@/components/weekday-picker";
import { MenuItemTypeFields } from "@/components/menu-item-type-fields";
import { getMenuItemTypeLabel, type MenuItemType } from "@/lib/menu-items";
import {
  toggleProviderMenuItemActive,
  updateProviderMenuItem,
} from "@/app/admin/providers/[id]/actions";

type Props = {
  providerId: string;
  item: {
    id: string;
    name: string;
    description: string | null;
    price: number | string;
    itemType: string;
    unitLabel: string;
    displayCategory: string | null;
    active: boolean;
    weekdays: number[];
  };
};

export function MenuItemAdminCard({ providerId, item }: Props) {
  return (
    <Card padding="sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{item.name}</h3>
            {!item.active && <StatusBadge status="inactive" />}
          </div>
          {item.description && (
            <p className="mt-0.5 text-sm text-muted line-clamp-2">{item.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-foreground">{formatCurrency(item.price)}</span>
            {item.unitLabel && item.unitLabel.toLowerCase() !== "each" && (
              <>
                <span className="text-border">|</span>
                <span>{item.unitLabel}</span>
              </>
            )}
            <span className="text-border">|</span>
            <span>{getMenuItemTypeLabel(item.itemType as MenuItemType)}</span>
            {item.displayCategory && (
              <>
                <span className="text-border">|</span>
                <span>{item.displayCategory}</span>
              </>
            )}
            <span className="text-border">|</span>
            <span>{formatWeekdayList(item.weekdays)}</span>
          </div>
        </div>
      </div>

      <details className="mt-3 border-t border-border pt-3 group">
        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
          Edit menu item
        </summary>
        <div className="mt-4 grid max-w-xl gap-6">
          <form action={updateProviderMenuItem} className="grid gap-4">
            <input type="hidden" name="providerId" value={providerId} />
            <input type="hidden" name="menuItemId" value={item.id} />

            <FormField label="Name" htmlFor={`name-${item.id}`}>
              <input
                id={`name-${item.id}`}
                name="name"
                defaultValue={item.name}
                required
                className={inputClassName}
              />
            </FormField>

            <FormField label="Description" htmlFor={`description-${item.id}`}>
              <textarea
                id={`description-${item.id}`}
                name="description"
                rows={2}
                defaultValue={item.description ?? ""}
                className={textareaClassName}
              />
            </FormField>

            <FormField label="Price" htmlFor={`price-${item.id}`}>
              <input
                id={`price-${item.id}`}
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(item.price)}
                required
                className={inputClassName}
              />
            </FormField>

            <MenuItemTypeFields
              defaultItemType={item.itemType}
              defaultUnitLabel={item.unitLabel}
              defaultDisplayCategory={item.displayCategory ?? ""}
              itemTypeId={`itemType-${item.id}`}
              unitLabelId={`unitLabel-${item.id}`}
              displayCategoryId={`displayCategory-${item.id}`}
            />

            <WeekdayPicker defaultWeekdays={item.weekdays} />

            <button type="submit" className={linkButtonClass("secondary")}>
              Save menu item
            </button>
          </form>

          <form action={toggleProviderMenuItemActive} className="border-t border-border pt-4">
            <input type="hidden" name="providerId" value={providerId} />
            <input type="hidden" name="menuItemId" value={item.id} />
            <input type="hidden" name="active" value={String(item.active)} />
            <button
              type="submit"
              className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
            >
              {item.active ? "Deactivate item" : "Activate item"}
            </button>
          </form>
        </div>
      </details>
    </Card>
  );
}
