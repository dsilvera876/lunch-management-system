import Link from "next/link";
import { IconUtensils } from "@/components/icons/line-icons";

export function SidebarBrand({
  homeHref,
  variant = "dark",
}: {
  homeHref: string;
  variant?: "dark" | "light";
}) {
  const isDark = variant === "dark";

  return (
    <Link href={homeHref} className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
        <IconUtensils size={20} className="text-white" />
      </span>
      <span>
        <span
          className={`block text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}
        >
          Lunch Management System
        </span>
        <span className={`block text-xs ${isDark ? "text-sidebar-muted" : "text-muted"}`}>
          Internal ordering system
        </span>
      </span>
    </Link>
  );
}
