import type { GroupedCheckout } from "@/lib/staff-my-orders";

const styles: Record<GroupedCheckout["checkoutStatusKind"], string> = {
  upcoming: "bg-primary/10 text-primary ring-primary/25",
  submitted: "bg-blue-50 text-blue-800 ring-blue-200",
  delivered: "bg-slate-100 text-slate-700 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  issue: "bg-amber-50 text-amber-900 ring-amber-200",
};

type Props = {
  label: string;
  kind: GroupedCheckout["checkoutStatusKind"];
};

export function CheckoutStatusBadge({ label, kind }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[kind]}`}
    >
      {label}
    </span>
  );
}
