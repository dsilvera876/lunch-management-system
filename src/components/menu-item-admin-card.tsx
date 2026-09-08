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
    active: boolean;
    weekdays: number[];
  };
};

export function MenuItemAdminCard({ providerId, item }: Props) {
  return (
    <Card padding="md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{item.name}</h3>
            <StatusBadge status={item.active ? "active" : "inactive"} />
          </div>
          {item.description && (
            <p className="mt-1 text-sm text-muted">{item.description}</p>
          )}
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="font-medium">{getMenuItemTypeLabel(item.itemType as MenuItemType)}</dd>
            </div>
            <div>
              <dt className="text-muted">Unit</dt>
              <dd className="font-medium">{item.unitLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Price</dt>
              <dd className="font-medium">{formatCurrency(item.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">Available order days</dt>
              <dd className="font-medium">{formatWeekdayList(item.weekdays)}</dd>
            </div>
          </dl>
        </div>

        <form action={toggleProviderMenuItemActive} className="shrink-0">
          <input type="hidden" name="providerId" value={providerId} />
          <input type="hidden" name="menuItemId" value={item.id} />
          <input type="hidden" name="active" value={String(item.active)} />
          <button
            type="submit"
            className={linkButtonClass(item.active ? "danger" : "secondary")}
          >
            {item.active ? "Deactivate item" : "Activate item"}
          </button>
        </form>
      </div>

      <details className="mt-4 border-t border-border pt-4 group">
        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
          Edit menu item
        </summary>
        <form
          action={updateProviderMenuItem}
          className="mt-4 grid max-w-xl gap-4"
        >
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
            itemTypeId={`itemType-${item.id}`}
            unitLabelId={`unitLabel-${item.id}`}
          />

          <WeekdayPicker defaultWeekdays={item.weekdays} />

          <button type="submit" className={linkButtonClass("secondary")}>
            Save menu item
          </button>
        </form>
      </details>
    </Card>
  );
}
