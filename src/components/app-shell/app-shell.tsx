"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  getNavForRole,
  getPostLoginPath,
  getRoleLabel,
  isNavActive,
  type NavGroup,
  ACCOUNT_NAV,
} from "@/lib/navigation";

type Profile = {
  full_name: string | null;
  role: string;
};

function NavLinks({
  groups,
  pathname,
  onNavigate,
  variant = "sidebar",
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  variant?: "sidebar" | "light";
}) {
  const isSidebar = variant === "sidebar";

  return (
    <div className="space-y-6">
      {groups.map((group, index) => (
        <div key={group.label} className={index > 0 ? (isSidebar ? "pt-6 border-t border-white/5" : "pt-6 border-t border-border") : ""}>
          {group.label !== "LUNCH" && (
            <h3
              className={`mb-3 px-3 text-[11px] font-semibold uppercase tracking-widest ${
                isSidebar ? "text-sidebar-muted/70" : "text-muted/70"
              }`}
            >
              {group.label}
            </h3>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? isSidebar
                          ? "bg-white/10 text-white"
                          : "bg-primary/10 text-primary"
                        : isSidebar
                          ? "text-sidebar-muted hover:bg-white/5 hover:text-white"
                          : "text-foreground hover:bg-background"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = getNavForRole(profile.role);
  const homeHref = getPostLoginPath(profile.role);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href={homeHref} className="block">
            <span className="text-lg font-semibold text-white">
              Lunch Management
            </span>
            <span className="mt-1 block text-xs text-sidebar-muted">
              Internal ordering system
            </span>
          </Link>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks groups={navItems} pathname={pathname} />
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <Link
            href={ACCOUNT_NAV.href}
            className="mb-3 block text-sm font-medium text-sidebar-muted transition-colors hover:text-white"
          >
            {ACCOUNT_NAV.label}
          </Link>
          <p className="truncate text-sm font-medium text-white">
            {profile.full_name ?? "User"}
          </p>
          <p className="text-xs text-sidebar-muted">{getRoleLabel(profile.role)}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              type="submit"
              className="text-sm font-medium text-sidebar-muted underline-offset-2 hover:text-white hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Lunch Management
            </p>
            <p className="text-xs text-muted">
              {profile.full_name ?? "User"} · {getRoleLabel(profile.role)}
            </p>
          </div>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium"
          >
            {mobileOpen ? "Close" : "Menu"}
          </button>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Primary mobile"
            className="border-t border-border px-3 py-3"
          >
            <NavLinks
              groups={navItems}
              pathname={pathname}
              variant="light"
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="mt-6 border-t border-border px-3 pt-4">
              <Link
                href={ACCOUNT_NAV.href}
                onClick={() => setMobileOpen(false)}
                className="mb-3 block text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                {ACCOUNT_NAV.label}
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm font-medium text-muted underline-offset-2 hover:underline"
                >
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        )}
      </header>

      <div className="lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
