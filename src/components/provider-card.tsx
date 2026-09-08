import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";
import { linkButtonClass } from "@/components/ui/button";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  itemType: string;
  unitLabel: string;
};

type Props = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  items: MenuItem[];
  orderingOpen?: boolean;
};

export function ProviderCard({
  id,
  name,
  description,
  itemCount,
  items,
  orderingOpen = true,
}: Props) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted">{description}</p>
            )}
            <p className="mt-2 text-sm text-muted">
              {itemCount} {itemCount === 1 ? "item" : "items"} available today
            </p>
          </div>
          {orderingOpen && (
            <Link
              href={`/lunch/providers/${id}`}
              className={`${linkButtonClass("primary")} shrink-0`}
            >
              Order from {name}
            </Link>
          )}
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0 truncate">
                {formatMenuItemLabel(item.name, item.unitLabel)}
              </span>
              <span className="shrink-0 font-medium">
                {formatCurrency(item.price)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
