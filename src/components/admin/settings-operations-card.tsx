import Link from "next/link";
import { NavIcon, type NavIconId } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  href: string;
  title: string;
  description: string;
  actionLabel: string;
  icon: NavIconId;
};

export function SettingsOperationsCard({
  href,
  title,
  description,
  actionLabel,
  icon,
}: Props) {
  return (
    <Card padding="md" className="flex h-full flex-col shadow-sm">
      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start">
        <TealIconWell size="md" className="rounded-xl">
          <NavIcon id={icon} size={20} />
        </TealIconWell>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 flex-1 text-sm text-muted">{description}</p>
          <Link href={href} className={`${linkButtonClass("secondary")} mt-4 w-fit`}>
            {actionLabel}
          </Link>
        </div>
      </div>
    </Card>
  );
}
