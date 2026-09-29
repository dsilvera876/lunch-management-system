"use client";

import { createContext, useContext } from "react";
import type { ActiveSupportSession } from "@/lib/support-mode";
import { isSupportReadOnlyActor } from "@/lib/support-mode";
import type { UserRole } from "@/lib/roles";

type SupportModeContextValue = {
  session: ActiveSupportSession | null;
  readOnly: boolean;
};

const SupportModeContext = createContext<SupportModeContextValue>({
  session: null,
  readOnly: false,
});

export function SupportModeProvider({
  role,
  session,
  children,
}: {
  role: UserRole;
  session: ActiveSupportSession | null;
  children: React.ReactNode;
}) {
  const readOnly = isSupportReadOnlyActor(role, session);

  return (
    <SupportModeContext.Provider value={{ session, readOnly }}>
      {children}
    </SupportModeContext.Provider>
  );
}

export function useSupportMode() {
  return useContext(SupportModeContext);
}

export const SUPPORT_MODE_DISABLED_HINT = "Changes are unavailable in Support Mode.";
