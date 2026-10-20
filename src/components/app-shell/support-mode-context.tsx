"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { reconcileSupportSessionAction } from "@/app/admin/support/actions";
import {
  getSupportSessionIdentity,
  isSupportReadOnlyActor,
  supportSessionIdentityKey,
  type ActiveSupportSession,
} from "@/lib/support-mode";
import { getSupportSessionRemainingMs } from "@/lib/support-mode-expiry";
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
  const pathname = usePathname();
  const identity = useMemo(
    () => (session ? getSupportSessionIdentity(session) : null),
    [session],
  );
  const identityKey = identity ? supportSessionIdentityKey(identity) : null;
  const [accessHidden, setAccessHidden] = useState(
    () => session !== null && getSupportSessionRemainingMs(session.expiresAt) === 0,
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const reconcilePendingRef = useRef(false);
  const expirationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPathnameRef = useRef(pathname);

  const navigateToPermanentExperience = useCallback(() => {
    window.location.replace("/admin/support");
  }, []);

  const reconcile = useCallback(() => {
    if (!identity || !identityKey) {
      return;
    }

    const locallyExpired = getSupportSessionRemainingMs(identity.expiresAt) === 0;
    if (locallyExpired) {
      setAccessHidden(true);
    }

    if (inFlightRef.current) {
      reconcilePendingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    startTransition(() => {
      void reconcileSupportSessionAction(identity)
        .then((result) => {
          if (!mountedRef.current) {
            return;
          }

          if (!result.success || result.status !== "current") {
            setAccessHidden(true);
            navigateToPermanentExperience();
            return;
          }

          if (getSupportSessionRemainingMs(identity.expiresAt) === 0) {
            // The browser clock can be slightly ahead of the database clock.
            // Keep content hidden and retry the read-only check until the
            // authoritative session expires.
            setAccessHidden(true);
            if (retryTimerRef.current === null) {
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                setRetryVersion((version) => version + 1);
              }, 1_000);
            }
          }
        })
        .catch(() => {
          if (!mountedRef.current) {
            return;
          }
          setAccessHidden(true);
          navigateToPermanentExperience();
        })
        .finally(() => {
          inFlightRef.current = false;
          if (mountedRef.current && reconcilePendingRef.current) {
            reconcilePendingRef.current = false;
            setRetryVersion((version) => version + 1);
          }
        });
    });
  }, [identity, identityKey, navigateToPermanentExperience]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (expirationTimerRef.current !== null) {
        clearTimeout(expirationTimerRef.current);
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!identity) {
      return;
    }

    const remainingMs = getSupportSessionRemainingMs(identity.expiresAt);
    if (remainingMs === 0) {
      expirationTimerRef.current = setTimeout(() => {
        expirationTimerRef.current = null;
        reconcile();
      }, 0);
    } else {
      expirationTimerRef.current = setTimeout(() => {
        expirationTimerRef.current = null;
        reconcile();
      }, remainingMs);
    }

    return () => {
      if (expirationTimerRef.current !== null) {
        clearTimeout(expirationTimerRef.current);
        expirationTimerRef.current = null;
      }
    };
  }, [identity, reconcile]);

  useEffect(() => {
    if (identity && previousPathnameRef.current !== pathname) {
      reconcile();
    }
    previousPathnameRef.current = pathname;
  }, [identity, pathname, reconcile]);

  useEffect(() => {
    if (retryVersion > 0) {
      const retry = setTimeout(reconcile, 0);
      return () => clearTimeout(retry);
    }
  }, [reconcile, retryVersion]);

  useEffect(() => {
    if (!identity) {
      return;
    }

    const reconcileOnFocus = () => reconcile();
    const reconcileOnVisibility = () => {
      if (document.visibilityState === "visible") {
        reconcile();
      }
    };
    const reconcileOnPageShow = () => reconcile();

    window.addEventListener("focus", reconcileOnFocus);
    document.addEventListener("visibilitychange", reconcileOnVisibility);
    window.addEventListener("pageshow", reconcileOnPageShow);

    return () => {
      window.removeEventListener("focus", reconcileOnFocus);
      document.removeEventListener("visibilitychange", reconcileOnVisibility);
      window.removeEventListener("pageshow", reconcileOnPageShow);
    };
  }, [identity, reconcile]);

  const readOnly = isSupportReadOnlyActor(role, session);
  const locallyExpired =
    session !== null && getSupportSessionRemainingMs(session.expiresAt) === 0;

  if (session && (accessHidden || locallyExpired)) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background px-4"
        data-support-mode-expiration-gate
      >
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">
            Support Mode access expired
          </h1>
          <p className="mt-2 text-sm text-muted" role="status">
            Verifying access and restoring your permanent account experience…
          </p>
        </div>
      </main>
    );
  }

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
