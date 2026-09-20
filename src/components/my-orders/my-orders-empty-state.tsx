import type { ReactNode } from "react";
import { NavIcon, type NavIconId } from "@/components/icons/line-icons";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: NavIconId;
};

export function MyOrdersEmptyState({
  title,
  description,
  action,
  icon = "receipt",
}: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-surface/60 px-4 py-6 text-center">
      <span className="mx-auto inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <NavIcon id={icon} size={20} />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
