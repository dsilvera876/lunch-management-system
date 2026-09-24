import { IconTruck } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

type Props = {
  deliveryDateLabel: string;
  reconciled: number;
  total: number;
};

export function DeliveriesPageHeader({
  deliveryDateLabel,
  reconciled,
  total,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <TealIconWell size="lg" className="shrink-0">
          <IconTruck aria-hidden />
        </TealIconWell>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Deliveries
          </h1>
          <p className="text-sm text-muted">{deliveryDateLabel}</p>
        </div>
      </div>
      <p className="shrink-0 text-sm tabular-nums text-muted">
        {reconciled} / {total} reconciled
      </p>
    </div>
  );
}
