"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { refreshProfileIfRoleChanged } from "@/lib/profile-refresh-client";
import { shouldCheckRoleOnNavigation } from "@/lib/profile-refresh";
import { AppShell } from "./app-shell";

type Profile = {
  full_name: string | null;
  role: string;
};

const AUTH_PATHS = ["/login", "/signup"];

export function AppShellWrapper({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const previousPathnameRef = useRef<string | null>(null);
  const isAuthPage = AUTH_PATHS.includes(pathname);

  useEffect(() => {
    if (!profile || isAuthPage) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (!shouldCheckRoleOnNavigation(previousPathnameRef.current, pathname)) {
      previousPathnameRef.current = pathname;
      return;
    }

    previousPathnameRef.current = pathname;

    const abortController = new AbortController();

    void refreshProfileIfRoleChanged(
      profile.role,
      () => router.refresh(),
      abortController.signal,
    );

    return () => {
      abortController.abort();
    };
  }, [pathname, profile, isAuthPage, router]);

  if (!profile || isAuthPage) {
    return <>{children}</>;
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
