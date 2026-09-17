"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  getNavForRole,
  getPostLoginPath,
  isNavActive,
  type NavGroup,
} from "@/lib/navigation";
import { NavIcon } from "@/components/icons/line-icons";
import { SidebarBrand } from "@/components/app-shell/sidebar-brand";
import { TopHeader } from "@/components/app-shell/top-header";

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
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div
          key={group.label}
          className={index > 0 ? (isSidebar ? "pt-5 border-t border-white/10" : "pt-5 border-t border-border") : ""}
        >
          <h3
            className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              isSidebar ? "text-sidebar-muted/90" : "text-muted"
            }`}
          >
            {group.label}
          </h3>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg border-l-2 py-2 pl-[10px] pr-3 text-sm font-medium transition-colors ${
                      active
                        ? isSidebar
                          ? "border-primary bg-sidebar-active text-white"
                          : "border-primary bg-primary/10 text-primary"
                        : isSidebar
                          ? "border-transparent text-sidebar-muted hover:bg-white/5 hover:text-white"
                          : "border-transparent text-foreground hover:bg-background"
                    }`}
                  >
                    <NavIcon
                      id={item.icon}
                      size={18}
                      className={
                        active
                          ? isSidebar
                            ? "shrink-0 text-accent"
                            : "shrink-0 text-primary"
                          : isSidebar
                            ? "shrink-0 text-teal-400/45"
                            : "shrink-0 text-muted"
                      }
                    />
                    <span className="truncate">{item.label}</span>
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <SidebarBrand homeHref={homeHref} />
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks groups={navItems} pathname={pathname} />
        </nav>

        <div className="mt-auto border-t border-white/10 px-5 py-5 pb-6">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-sidebar-muted underline-offset-2 hover:text-white hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="border-b border-border bg-surface lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <SidebarBrand homeHref={homeHref} variant="light" />
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

        {mobileOpen ? (
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
            <form action="/auth/signout" method="post" className="mt-5 border-t border-border pt-5 pb-2">
              <button
                type="submit"
                className="text-sm font-medium text-muted underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </form>
          </nav>
        ) : null}
      </header>

      <div className="lg:pl-64">
        <TopHeader profile={profile} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
