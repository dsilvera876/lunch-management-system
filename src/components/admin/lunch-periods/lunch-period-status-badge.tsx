import type { LunchPeriodAdminStatus } from "@/lib/lunch-periods";

const styles: Record<LunchPeriodAdminStatus, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  locked: "bg-slate-100 text-slate-700 ring-slate-200",
};

const labels: Record<LunchPeriodAdminStatus, string> = {
  active: "Active",
  locked: "Locked",
};

export function LunchPeriodStatusBadge({ status }: { status: LunchPeriodAdminStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
