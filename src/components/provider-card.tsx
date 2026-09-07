import Link from "next/link";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
};

export function ProviderCard({ id, name, description, itemCount }: Props) {
  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted">{description}</p>
          )}
          <p className="mt-3 text-sm text-foreground">
            {itemCount} menu {itemCount === 1 ? "item" : "items"} available today
          </p>
        </div>
        <Link
          href={`/lunch/providers/${id}`}
          className={linkButtonClass("primary")}
        >
          Order from this provider
        </Link>
      </div>
    </Card>
  );
}
