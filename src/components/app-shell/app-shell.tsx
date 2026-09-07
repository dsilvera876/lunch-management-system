"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  getNavForRole,
  getPostLoginPath,
  getRoleLabel,
  isNavActive,
  type NavItem,
} from "@/lib/navigation";

type Profile = {
  full_name: string | null;
  role: string;
};

function NavLinks({
  items,
  pathname,
  onNavigate,
  variant = "sidebar",
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  variant?: "sidebar" | "light";
}) {
  const isSidebar = variant === "sidebar";

  return (
    <ul className="space-y-1">
      {items.map((item) => {
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
          <NavLinks items={navItems} pathname={pathname} />
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
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
              items={navItems}
              pathname={pathname}
              variant="light"
              onNavigate={() => setMobileOpen(false)}
            />
            <form action="/auth/signout" method="post" className="mt-3 px-3">
              <button
                type="submit"
                className="text-sm font-medium text-muted underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </form>
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
