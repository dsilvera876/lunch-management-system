"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBreadcrumbs } from "@/lib/breadcrumbs";
import { getRoleLabel } from "@/lib/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ACCOUNT_NAV } from "@/lib/navigation";
import { formatJamaicaHeaderDate, getJamaicaTodayDate } from "@/lib/datetime";

type Props = {
  profile: {
    full_name: string | null;
    role: string;
  };
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

export function TopHeader({ profile }: Props) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);
  const jamaicaToday = getJamaicaTodayDate();
  const headerDateLabel = formatJamaicaHeaderDate(jamaicaToday);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <Breadcrumbs items={breadcrumbs} />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          <time
            dateTime={jamaicaToday}
            className="hidden whitespace-nowrap text-sm font-medium text-slate-600 md:inline"
          >
            {headerDateLabel}
          </time>
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-primary/70 hover:bg-background hover:text-primary"
          >
            <span className="sr-only">Notifications</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden
            >
              <path d="M15 17H9l-1 4h8z" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="absolute right-2.5 top-2 size-2 rounded-full bg-primary" />
          </button>

          <Link
            href={ACCOUNT_NAV.href}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-3 text-sm hover:bg-background"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {getInitials(profile.full_name)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate font-medium text-foreground">
                {profile.full_name ?? "User"}
              </span>
              <span className="block truncate text-xs text-muted">
                {getRoleLabel(profile.role)}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
