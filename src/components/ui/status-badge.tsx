type StatusKind =
  | "submitted"
  | "cancelled"
  | "fulfilled"
  | "open"
  | "closed"
  | "active"
  | "inactive"
  | "draft"
  | "completed";

const styles: Record<StatusKind, string> = {
  submitted: "bg-blue-50 text-blue-800 ring-blue-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
  fulfilled: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  open: "bg-teal-50 text-teal-800 ring-teal-200",
  closed: "bg-amber-50 text-amber-900 ring-amber-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  inactive: "bg-slate-100 text-slate-600 ring-slate-200",
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

const labels: Record<StatusKind, string> = {
  submitted: "Submitted",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
  open: "Open",
  closed: "Closed",
  active: "Active",
  inactive: "Inactive",
  draft: "Draft",
  completed: "Completed",
};

export function StatusBadge({ status }: { status: string }) {
  const kind = (status in labels ? status : "draft") as StatusKind;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[kind]}`}
    >
      {labels[kind] ?? status}
    </span>
  );
}
