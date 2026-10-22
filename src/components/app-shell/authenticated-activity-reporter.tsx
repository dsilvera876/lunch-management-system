"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createUserActivityRecorder,
  readUserActivityRpcRow,
} from "@/lib/user-activity-client";

const STORAGE_PREFIX = "lunch-management:last-active:";

function readSharedTimestamp(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) {
      return null;
    }

    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function writeSharedTimestamp(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Local storage can be unavailable. PostgreSQL remains the authoritative
    // cross-tab throttle, so activity reporting can continue safely.
  }
}

function pageIsVisible(): boolean {
  return document.visibilityState === "visible";
}

function visiblePageHasFocus(): boolean {
  return pageIsVisible() && document.hasFocus();
}

export function AuthenticatedActivityReporter({ profileId }: { profileId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const recorderRef = useRef<ReturnType<typeof createUserActivityRecorder> | null>(
    null,
  );

  useEffect(() => {
    const storageKey = `${STORAGE_PREFIX}${profileId}`;
    const supabase = createClient();
    let active = true;

    const recorder = createUserActivityRecorder({
      record: async () => {
        const { data, error } = await supabase.rpc("record_current_user_activity");
        if (error) {
          throw new Error("Unable to record activity.");
        }
        return readUserActivityRpcRow(data);
      },
      readSharedLastActiveAt: () => readSharedTimestamp(storageKey),
      writeSharedLastActiveAt: (value) => {
        if (active) {
          writeSharedTimestamp(storageKey, value);
        }
      },
    });
    recorderRef.current = recorder;

    const reportVisibleInteraction = () => {
      if (active && visiblePageHasFocus()) {
        void recorder.recordIfEligible();
      }
    };
    const reportVisibleFocus = () => {
      if (active && visiblePageHasFocus()) {
        void recorder.recordIfEligible();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.repeat) {
        reportVisibleInteraction();
      }
    };
    const handleVisibilityChange = () => {
      if (pageIsVisible()) {
        reportVisibleFocus();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) {
        return;
      }
      recorder.synchronize(Number(event.newValue));
    };

    window.addEventListener("focus", reportVisibleFocus);
    window.addEventListener("pageshow", reportVisibleFocus);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", reportVisibleInteraction, true);
    document.addEventListener("keydown", handleKeyDown, true);
    reportVisibleFocus();

    return () => {
      active = false;
      recorderRef.current = null;
      window.removeEventListener("focus", reportVisibleFocus);
      window.removeEventListener("pageshow", reportVisibleFocus);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", reportVisibleInteraction, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [profileId]);

  useEffect(() => {
    if (routeKey && visiblePageHasFocus()) {
      void recorderRef.current?.recordIfEligible();
    }
  }, [routeKey]);

  return null;
}
