import { IconHistory } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

export function OrderHistoryPageHeader() {
  return (
    <div className="mb-4 flex min-w-0 items-start gap-3">
      <TealIconWell size="lg" className="shrink-0">
        <IconHistory aria-hidden />
      </TealIconWell>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Order History</h1>
        <p className="text-sm text-muted">
          Review past lunch orders, delivery outcomes, and issue history.
        </p>
      </div>
    </div>
  );
}
