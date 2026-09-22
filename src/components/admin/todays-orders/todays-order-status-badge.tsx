import { getTodaysOrderStatusLabel } from "@/lib/todays-orders-presentation";
import type { OperationalOrder } from "@/lib/operational-orders";

const toneByLabel: Record<string, string> = {
  Cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
  "Delivery issue": "bg-rose-50 text-rose-800 ring-rose-200",
  Delivered: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Resolved — no charge": "bg-slate-100 text-slate-700 ring-slate-200",
  Resolved: "bg-teal-50 text-teal-800 ring-teal-200",
  Pending: "bg-primary/10 text-primary ring-primary/25",
};

type Props = {
  order: OperationalOrder;
};

export function TodaysOrderStatusBadge({ order }: Props) {
  const label = getTodaysOrderStatusLabel(order);
  const tone = toneByLabel[label] ?? "bg-slate-100 text-slate-700 ring-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}
