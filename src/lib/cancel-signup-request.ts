import {
  attemptAuthAdminDeleteUser,
  finalizeAuthUserDeletion,
} from "@/lib/process-auth-user-deletion-cleanup";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CancelSignupRequestRpcRow = {
  success: boolean;
  outcome_code: string;
  message: string;
  auth_user_id: string | null;
  audit_id: string | null;
};

export type CancelSignupRequestOrchestrationResult =
  | { success: true }
  | { success: false; message: string; retryable: boolean };

function parseCancelRow(data: unknown): CancelSignupRequestRpcRow | null {
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== "object") {
    return null;
  }

  const row = data[0] as Record<string, unknown>;
  return {
    success: row.success === true,
    outcome_code: String(row.outcome_code ?? ""),
    message: String(row.message ?? ""),
    auth_user_id: row.auth_user_id ? String(row.auth_user_id) : null,
    audit_id: row.audit_id ? String(row.audit_id) : null,
  };
}

export async function orchestrateSignupRequestCancellation(input: {
  supabase: SupabaseClient;
  requestId: string;
  reason: string;
  note?: string;
}): Promise<CancelSignupRequestOrchestrationResult> {
  const { data, error } = await input.supabase.rpc("cancel_signup_request", {
    p_request_id: input.requestId,
    p_reason: input.reason,
    p_note: input.note?.trim() || null,
  });

  if (error) {
    console.error("[signup-cancel] cancel_signup_request failed:", error.message);
    return {
      success: false,
      message: "Unable to cancel this signup request.",
      retryable: true,
    };
  }

  const row = parseCancelRow(data);
  if (!row) {
    return {
      success: false,
      message: "Unable to cancel this signup request.",
      retryable: true,
    };
  }

  if (row.success && row.outcome_code === "cancelled") {
    return { success: true };
  }

  if (row.success && row.outcome_code === "already_cancelled") {
    return { success: true };
  }

  if (!row.success && row.outcome_code !== "auth_cleanup_required") {
    return {
      success: false,
      message: row.message,
      retryable: row.outcome_code === "auth_cleanup_incomplete",
    };
  }

  if (!row.auth_user_id || !row.audit_id) {
    console.error("[signup-cancel] auth cleanup required but ids missing", row);
    return {
      success: false,
      message:
        "Account setup cleanup could not be started. Try again or contact an administrator.",
      retryable: true,
    };
  }

  const service = createServiceClient();
  const authAttempt = await attemptAuthAdminDeleteUser(row.auth_user_id, service);
  const authStatus = await finalizeAuthUserDeletion(service, row.audit_id, authAttempt);

  if (authStatus !== "succeeded") {
    console.warn(
      `[signup-cancel] auth delete pending for request=${input.requestId} auth=${row.auth_user_id} audit=${row.audit_id} status=${authStatus}`,
    );
    return {
      success: false,
      message:
        "Account setup cleanup is still in progress. Try cancelling again in a moment.",
      retryable: true,
    };
  }

  const { data: completeData, error: completeError } = await service.rpc(
    "complete_signup_request_cancellation",
    {
      p_request_id: input.requestId,
      p_reason: input.reason,
      p_note: input.note?.trim() || null,
      p_auth_user_id: row.auth_user_id,
    },
  );

  if (completeError) {
    console.error(
      "[signup-cancel] complete_signup_request_cancellation failed:",
      completeError.message,
    );
    return {
      success: false,
      message:
        "Authentication was removed, but the signup request could not be finalized. Try again.",
      retryable: true,
    };
  }

  const completeRow = parseCancelRow(completeData);
  if (!completeRow?.success) {
    return {
      success: false,
      message:
        completeRow?.message ??
        "Authentication was removed, but the signup request could not be finalized. Try again.",
      retryable: true,
    };
  }

  return { success: true };
}
