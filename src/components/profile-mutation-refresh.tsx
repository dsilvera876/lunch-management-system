"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { refreshProfileIfRoleChanged } from "@/lib/profile-refresh-client";

/**
 * Re-checks role after a server action redirect that may not change pathname,
 * e.g. ownership transfer on /admin/users.
 */
export function ProfileMutationRefresh({
  active,
  renderedRole,
}: {
  active: boolean;
  renderedRole: string;
}) {
  const router = useRouter();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!active || checkedRef.current) {
      return;
    }

    checkedRef.current = true;

    const abortController = new AbortController();

    void refreshProfileIfRoleChanged(
      renderedRole,
      () => router.refresh(),
      abortController.signal,
    );

    return () => {
      abortController.abort();
    };
  }, [active, renderedRole, router]);

  return null;
}
