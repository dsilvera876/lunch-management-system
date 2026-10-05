"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  getNavForRole,
  getPostLoginPath,
  isNavItemActive,
  type NavGroup,
} from "@/lib/navigation";
import type { UserRole } from "@/lib/roles";
import { NavIcon } from "@/components/icons/line-icons";
import { SidebarBrand } from "@/components/app-shell/sidebar-brand";
import { TopHeader } from "@/components/app-shell/top-header";
import { buildAppNotifications } from "@/lib/app-notification-sources";
import type { ActiveSupportSession } from "@/lib/support-mode";
import { SupportModeProvider } from "@/components/app-shell/support-mode-context";
import { SupportModeBanner } from "@/components/app-shell/support-mode-banner";

type Profile = {
  full_name: string | null;
  role: string;
};

function NavLinks({
  groups,
  pathname,
  role,
  usersContext,
  supportScope,
  onNavigate,
  variant = "sidebar",
}: {
  groups: NavGroup[];
  pathname: string;
  role: UserRole;
  usersContext: string | null;
  supportScope: import("@/lib/support-mode").SupportScope | null;
  onNavigate?: () => void;
  variant?: "sidebar" | "light";
}) {
  const isSidebar = variant === "sidebar";
  /** Mobile drawer only — staff gets darker teal on primary/10 for AA contrast. */
  const staffMobileNav = !isSidebar && role === "staff";

  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div
          key={group.label ?? "primary"}
          className={index > 0 ? (isSidebar ? "pt-5 border-t border-white/10" : "pt-5 border-t border-border") : ""}
        >
          {group.label ? (
            <h3
              className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                isSidebar ? "text-sidebar-muted/90" : "text-muted"
              }`}
            >
              {group.label}
            </h3>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(
                pathname,
                item,
                role,
                group.label,
                usersContext,
                supportScope,
              );

              return (
                <li key={`${group.label ?? "primary"}:${item.href}:${item.label}`}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg border-l-2 py-2 pl-[10px] pr-3 text-sm font-medium transition-colors ${
                      active
                        ? isSidebar
                          ? "border-primary bg-sidebar-active text-white"
                          : staffMobileNav
                            ? "staff-tab-selected border-primary bg-primary/10 text-staff-teal"
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
                            : staffMobileNav
                              ? "shrink-0 text-staff-teal"
                              : "shrink-0 text-primary"
                          : isSidebar
                            ? "shrink-0 text-sidebar-muted"
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
  hrPendingSignupCount = 0,
  supportSession = null,
  children,
}: {
  profile: Profile;
  hrPendingSignupCount?: number;
  supportSession?: ActiveSupportSession | null;
  children: React.ReactNode;
}) {
  const headerNotifications = buildAppNotifications(hrPendingSignupCount);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const usersContext = searchParams.get("context");
  const [mobileOpen, setMobileOpen] = useState(false);
  const userRole = profile.role as UserRole;
  const supportScope = supportSession?.scope ?? null;
  const navItems = getNavForRole(profile.role, supportScope);
  const homeHref = getPostLoginPath(profile.role);

  const supportProviderKey = supportSession
    ? `${supportSession.scope}:${supportSession.startedAt}`
    : "inactive";

  return (
    <SupportModeProvider key={supportProviderKey} role={userRole} session={supportSession}>
    <div className="min-h-screen bg-background">
      <div id="app-shell-inertible">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-[200%] rounded-lg border border-primary bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <SidebarBrand homeHref={homeHref} />
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks
            groups={navItems}
            pathname={pathname}
            role={userRole}
            usersContext={usersContext}
            supportScope={supportScope}
          />
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
              role={userRole}
              usersContext={usersContext}
              supportScope={supportScope}
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
        <SupportModeBanner />
        <TopHeader profile={profile} notifications={headerNotifications} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 focus:outline-none"
        >
          {children}
        </main>
      </div>
      </div>
      <div id="staff-modal-layer" />
    </div>
    </SupportModeProvider>
  );
}
