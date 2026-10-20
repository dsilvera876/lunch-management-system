"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminOrOwner } from "@/lib/auth";
import {
  formatSupportSessionStartError,
  isSupportScope,
  isSupportSessionId,
  isSupportSessionIdentity,
  mapSupportSessionFromRpcData,
  parseSupportSessionMutationOutcome,
  SUPPORT_SESSION_STALE_MESSAGE,
  supportSessionMatchesIdentity,
  supportScopeLandingPath,
  type SupportSessionIdentity,
  type SupportScope,
} from "@/lib/support-mode";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { createClient } from "@/lib/supabase/server";

export type SupportActionResult =
  | { success: true }
  | { success: false; error: string; stale?: true };

export type SupportSessionReconciliationResult =
  | { success: true; status: "current" | "expired" | "replaced" }
  | { success: false; error: string };

function revalidateSupportShell() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/support");
  revalidatePath("/admin/todays-orders");
  revalidatePath("/admin/lunch-periods");
}

export async function startSupportSessionAction(
  scope: SupportScope,
  reason: string,
  expectedSessionId: string | null,
): Promise<SupportActionResult> {
  const profile = await requireAdminOrOwner();

  if (!isSupportScope(scope)) {
    return { success: false, error: "Invalid support scope." };
  }

  if (expectedSessionId !== null && !isSupportSessionId(expectedSessionId)) {
    return { success: false, error: "Unable to verify the displayed Support Mode session." };
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return { success: false, error: "A reason is required to start Support Mode." };
  }

  const supabase = await createClient();
  const { data, error: startError } = await supabase.rpc("start_support_session", {
    p_scope: scope,
    p_reason: trimmed,
    p_expected_session_id: expectedSessionId,
  });

  if (startError) {
    console.error("[support-mode] start_support_session failed", {
      actorId: profile.id,
      actorRole: profile.role,
      scope,
      code: startError.code,
      message: startError.message,
    });
    return {
      success: false,
      error: formatSupportSessionStartError(startError.message),
    };
  }

  const outcome = parseSupportSessionMutationOutcome(data);
  if (outcome === "stale") {
    revalidateSupportShell();
    return {
      success: false,
      stale: true,
      error: SUPPORT_SESSION_STALE_MESSAGE,
    };
  }

  if (outcome !== "started") {
    return {
      success: false,
      error: "Support Mode could not be started. Refresh the page or try again.",
    };
  }

  const activeSession = await fetchActiveSupportSession(supabase);

  if (!activeSession || activeSession.scope !== scope) {
    console.error("[support-mode] session not visible after start_support_session", {
      actorId: profile.id,
      actorRole: profile.role,
      requestedScope: scope,
      activeScope: activeSession?.scope ?? null,
      expiresAt: activeSession?.expiresAt ?? null,
    });
    return {
      success: false,
      error:
        "Support Mode could not be confirmed after starting. Refresh the page or try again.",
    };
  }

  revalidateSupportShell();
  redirect(supportScopeLandingPath(scope));
}

export async function endSupportSessionAction(
  expectedSessionId: string,
): Promise<SupportActionResult> {
  const profile = await requireAdminOrOwner();

  if (!isSupportSessionId(expectedSessionId)) {
    return { success: false, error: "Unable to verify the displayed Support Mode session." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_support_session", {
    p_expected_session_id: expectedSessionId,
  });

  if (error) {
    console.error("[support-mode] end_support_session failed", {
      actorId: profile.id,
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      error: error.message || "Unable to exit Support Mode.",
    };
  }

  const outcome = parseSupportSessionMutationOutcome(data);
  if (outcome === "stale") {
    revalidateSupportShell();
    return {
      success: false,
      stale: true,
      error: SUPPORT_SESSION_STALE_MESSAGE,
    };
  }

  if (outcome !== "ended") {
    return {
      success: false,
      error: "Support Mode could not be ended. Try again or refresh the page.",
    };
  }

  const remaining = await fetchActiveSupportSession(supabase);
  if (remaining) {
    console.error("[support-mode] session still active after end_support_session", {
      actorId: profile.id,
      scope: remaining.scope,
      expiresAt: remaining.expiresAt,
    });
    return {
      success: false,
      error: "Support Mode could not be ended. Try again or refresh the page.",
    };
  }

  revalidateSupportShell();
  redirect("/admin/support");
}

/**
 * Read-only authoritative check used by the client expiration controller.
 * The expected identity prevents an older tab from treating a newer session
 * as its own. This action intentionally never ends or otherwise mutates a
 * support session; natural expiry retains the existing audit semantics.
 */
export async function reconcileSupportSessionAction(
  expected: SupportSessionIdentity,
): Promise<SupportSessionReconciliationResult> {
  const profile = await requireAdminOrOwner();

  if (!isSupportSessionIdentity(expected)) {
    return { success: false, error: "Unable to verify Support Mode." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_support_session_status");

  if (error) {
    console.error("[support-mode] expiration reconciliation failed", {
      actorId: profile.id,
      code: error.code,
      message: error.message,
    });
    return { success: false, error: "Unable to verify Support Mode." };
  }

  const activeSession = mapSupportSessionFromRpcData(data);
  if (!activeSession) {
    return { success: true, status: "expired" };
  }

  return {
    success: true,
    status: supportSessionMatchesIdentity(activeSession, expected)
      ? "current"
      : "replaced",
  };
}
