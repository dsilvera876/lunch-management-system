import { IconClock } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";

export const LATE_ORDERS_PAGE = {
  title: "Late Orders",
  description:
    "Create HR late-order exceptions after the normal company cutoff and send supplemental provider emails.",
  snapshotCallout:
    "Late orders use the saved menu for the selected provider and delivery date.",
} as const;

export function LateOrdersPageHeader() {
  return (
    <Card padding="sm" className="shadow-sm">
      <div className="flex min-w-0 items-start gap-4">
        <TealIconWell size="lg" className="shrink-0">
          <IconClock aria-hidden />
        </TealIconWell>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {LATE_ORDERS_PAGE.title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            {LATE_ORDERS_PAGE.description}
          </p>
          <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-slate-700">
            {LATE_ORDERS_PAGE.snapshotCallout}
          </p>
        </div>
      </div>
    </Card>
  );
}
