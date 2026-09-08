import Link from "next/link";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { groupStandaloneItemsByCategory, type MenuItemType } from "@/lib/menu-items";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  itemType: string;
  unitLabel: string;
  displayCategory: string | null;
};

type Props = {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
  orderingOpen?: boolean;
};

export function ProviderCard({
  id,
  name,
  description,
  items,
  orderingOpen = true,
}: Props) {
  const mains = items.filter((i) => i.itemType === "main");
  const sides = items.filter((i) => i.itemType === "side");
  const standalone = items.filter((i) => i.itemType === "standalone");

  const groupedStandalone = groupStandaloneItemsByCategory(standalone as { id: string; name: string; price: number; itemType: MenuItemType; unitLabel: string; displayCategory?: string | null }[]);

  return (
    <Card padding="md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted">{description}</p>
          )}

          <div className="mt-4 space-y-3">
            {mains.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Mains</h4>
                <ul className="text-sm space-y-1">
                  {mains.slice(0, 3).map(item => (
                    <li key={item.id} className="text-foreground">
                      {item.name} <span className="text-muted">{formatPrice(item.price)}</span>
                    </li>
                  ))}
                  {mains.length > 3 && (
                    <li className="text-muted italic">+ {mains.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            {sides.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Sides</h4>
                <p className="text-sm text-foreground">
                  {sides.slice(0, 4).map(s => s.name).join(", ")}
                  {sides.length > 4 && <span className="text-muted italic">, + {sides.length - 4} more</span>}
                </p>
              </div>
            )}

            {Object.entries(groupedStandalone).map(([category, catItems]) => (
              <div key={category}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">{category}</h4>
                <ul className="text-sm space-y-1">
                  {catItems.slice(0, 3).map(item => (
                    <li key={item.id} className="text-foreground">
                      {item.name} {item.unitLabel && item.unitLabel.toLowerCase() !== "each" ? `(${item.unitLabel})` : ""} <span className="text-muted">{formatPrice(item.price)}</span>
                    </li>
                  ))}
                  {catItems.length > 3 && (
                    <li className="text-muted italic">+ {catItems.length - 3} more</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {orderingOpen && (
          <div className="mt-4 sm:mt-0 shrink-0">
            <Link
              href={`/lunch/providers/${id}`}
              className={`${linkButtonClass("primary")} w-full sm:w-auto justify-center`}
            >
              View Menu
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
