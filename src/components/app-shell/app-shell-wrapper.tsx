"use client";

import { usePathname } from "next/navigation";
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
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (!profile || isAuthPage) {
    return <>{children}</>;
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
