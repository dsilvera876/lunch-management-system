"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBreadcrumbs } from "@/lib/breadcrumbs";
import { getRoleLabel } from "@/lib/navigation";
import { HeaderNotifications } from "@/components/app-shell/header-notifications";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ACCOUNT_NAV } from "@/lib/navigation";
import { formatJamaicaHeaderDate, getJamaicaTodayDate } from "@/lib/datetime";
import type { AppNotificationItem } from "@/lib/app-notification-sources";

type Props = {
  profile: {
    full_name: string | null;
    role: string;
  };
  notifications?: AppNotificationItem[];
};

function getInitials(name: string | null): string {
  if (!name?.trim()) {
    return "U";
  }

  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function TopHeader({ profile, notifications = [] }: Props) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname, { role: profile.role });
  const jamaicaToday = getJamaicaTodayDate();
  const headerDateLabel = formatJamaicaHeaderDate(jamaicaToday);
  const isStaff = profile.role === "staff";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <Breadcrumbs
            items={breadcrumbs}
            className={isStaff ? "text-staff-instruction" : undefined}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          <time
            dateTime={jamaicaToday}
            className="hidden whitespace-nowrap text-sm font-medium text-slate-600 md:inline"
          >
            {headerDateLabel}
          </time>
          <HeaderNotifications
            items={notifications}
            mutedTextClass={isStaff ? "text-staff-instruction" : "text-muted"}
          />

          <Link
            href={ACCOUNT_NAV.href}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-3 text-sm hover:bg-background"
          >
            <span
              className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${
                isStaff
                  ? "bg-primary/10 text-staff-teal-strong"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {getInitials(profile.full_name)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate font-medium text-foreground">
                {profile.full_name ?? "User"}
              </span>
              <span
                className={`block truncate text-xs ${isStaff ? "text-staff-instruction" : "text-muted"}`}
              >
                {getRoleLabel(profile.role)}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
