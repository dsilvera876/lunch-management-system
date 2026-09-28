import { runAuthUserDeletionAttemptForAudit } from "@/lib/process-auth-user-deletion-cleanup";
import { createServiceClient } from "@/lib/supabase/service";
import {
  parseUserDeletionEligibility,
  sanitizePermanentDeleteErrorMessage,
  type PermanentDeleteUserResult,
  type UserDeletionReasonCategory,
} from "@/lib/user-deletion";
import type { SupabaseClient } from "@supabase/supabase-js";

const AUTH_CLEANUP_PENDING_MESSAGE =
  "Application account was removed, but authentication cleanup is still pending. The email address cannot be reused until cleanup finishes. A background worker will retry automatically.";

export async function fetchUserDeletionEligibility(
  supabase: SupabaseClient,
  profileId: string,
) {
  const { data, error } = await supabase.rpc("get_user_deletion_eligibility", {
    p_profile_id: profileId,
  });

  if (error) {
    return null;
  }

  return parseUserDeletionEligibility(data);
}

type DeleteAccountRpcPayload = {
  ok?: boolean;
  profile_id?: string;
  audit_id?: string;
  auth_delete_status?: string;
  already_deleted?: boolean;
  code?: string;
  message?: string;
};

function parseDeleteAccountRpcPayload(data: unknown): DeleteAccountRpcPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as DeleteAccountRpcPayload;
}

export async function permanentlyDeleteUserAccountOrchestrated(input: {
  supabase: SupabaseClient;
  profileId: string;
  reasonCategory: UserDeletionReasonCategory;
  reasonNote?: string;
}): Promise<PermanentDeleteUserResult> {
  const { supabase, profileId, reasonCategory, reasonNote } = input;

  if (!profileId) {
    return { success: false, error: "invalid", message: "User not found." };
  }

  const { data, error } = await supabase.rpc("permanently_delete_user_account", {
    p_profile_id: profileId,
    p_reason_category: reasonCategory,
    p_reason_note: reasonNote ?? null,
  });

  if (error) {
    return {
      success: false,
      error: "database",
      message: sanitizePermanentDeleteErrorMessage(error.message),
    };
  }

  const payload = parseDeleteAccountRpcPayload(data);

  if (!payload?.ok) {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : "This account cannot be permanently deleted.";

    return {
      success: false,
      error: code === "not_found" ? "invalid" : "ineligible",
      message: sanitizePermanentDeleteErrorMessage(message),
    };
  }

  const auditId = typeof payload.audit_id === "string" ? payload.audit_id : null;
  const authStatus = payload.auth_delete_status;

  if (!auditId) {
    return {
      success: false,
      error: "database",
      message: "Unable to record authentication cleanup state.",
    };
  }

  if (authStatus === "succeeded") {
    return { success: "complete", profileId };
  }

  const service = createServiceClient();
  const authStatusAfterAttempt = await runAuthUserDeletionAttemptForAudit(
    auditId,
    profileId,
    service,
  );

  if (authStatusAfterAttempt === "succeeded") {
    return { success: "complete", profileId };
  }

  console.warn(
    `Permanent delete auth cleanup pending: profile=${profileId} audit=${auditId} status=${authStatusAfterAttempt}`,
  );

  return {
    success: "partial",
    profileId,
    message: AUTH_CLEANUP_PENDING_MESSAGE,
  };
}

