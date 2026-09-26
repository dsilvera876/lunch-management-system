import { getRoleLabel, type UserRole } from "@/lib/roles";

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  owner: "bg-amber-50 text-amber-900 ring-amber-200",
  admin: "bg-violet-50 text-violet-900 ring-violet-200",
  hr: "bg-sky-50 text-sky-900 ring-sky-200",
  accounts: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  staff: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function UserRoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE_CLASS[role]}`}
    >
      {getRoleLabel(role)}
    </span>
  );
}
