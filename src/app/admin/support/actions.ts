"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminOrOwner } from "@/lib/auth";
import {
  formatSupportSessionStartError,
  isSupportScope,
  supportScopeLandingPath,
  type SupportScope,
} from "@/lib/support-mode";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { createClient } from "@/lib/supabase/server";

export type SupportActionResult =
  | { success: true }
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
): Promise<SupportActionResult> {
  const profile = await requireAdminOrOwner();

  if (!isSupportScope(scope)) {
    return { success: false, error: "Invalid support scope." };
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return { success: false, error: "A reason is required to start Support Mode." };
  }

  const supabase = await createClient();
  const { error: startError } = await supabase.rpc("start_support_session", {
    p_scope: scope,
    p_reason: trimmed,
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

export async function endSupportSessionAction(): Promise<SupportActionResult> {
  const profile = await requireAdminOrOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_support_session");

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
