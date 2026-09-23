import type { ReactNode } from "react";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

/** Teal top accent for Order Details, Choose Items, and Provider Status cards. */
export const lateOrderMajorCardClassName =
  "overflow-hidden border-t-4 border-t-primary/50 shadow-sm";

type Props = {
  icon: ReactNode;
  title: string;
  description?: string;
};

export function LateOrderSectionHeader({ icon, title, description }: Props) {
  return (
    <div className="flex gap-3">
      <TealIconWell size="section" className="shrink-0">
        {icon}
      </TealIconWell>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
    </div>
  );
}
