"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { FORGOT_PASSWORD_PATH, UPDATE_PASSWORD_PATH } from "@/lib/auth-recovery";
import { refreshProfileIfRoleChanged } from "@/lib/profile-refresh-client";
import { shouldCheckRoleOnNavigation } from "@/lib/profile-refresh";
import { AppShell } from "./app-shell";

type Profile = {
  full_name: string | null;
  role: string;
};

const AUTH_PATHS = ["/login", "/signup", FORGOT_PASSWORD_PATH];

export function AppShellWrapper({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const previousPathnameRef = useRef<string | null>(null);
  const isRecoveryPasswordPage =
    pathname === UPDATE_PASSWORD_PATH && searchParams.get("recovery") === "1";
  const isAuthPage = AUTH_PATHS.includes(pathname) || isRecoveryPasswordPage;
  const isPrintDeliverySheet =
    (pathname.includes("/admin/orders/provider/") ||
      pathname.includes("/admin/deliveries/")) &&
    pathname.endsWith("/print");

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

  if (!profile || isAuthPage || isPrintDeliverySheet) {
    return <>{children}</>;
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
