import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";
import { sanitizePermanentDeleteErrorMessage } from "@/lib/user-deletion";

export type AuthDeletionAuditRow = {
  id: string;
  deleted_profile_id: string;
  normalized_email: string;
  auth_delete_status: "pending" | "succeeded" | "failed";
};

export type AuthUserDeletionAttemptResult =
  | { outcome: "succeeded" }
  | { outcome: "missing_user" }
  | { outcome: "retry"; message: string };

export type ProcessAuthDeletionCleanupResult = {
  claimed: number;
  succeeded: number;
  retried: number;
  terminalFailed: number;
};

export async function attemptAuthAdminDeleteUser(
  profileId: string,
  serviceClient: SupabaseClient = createServiceClient(),
): Promise<AuthUserDeletionAttemptResult> {
  const { error } = await serviceClient.auth.admin.deleteUser(profileId);

  if (!error) {
    return { outcome: "succeeded" };
  }

  const message = error.message ?? "Authentication cleanup failed";

  if (/not found|user not found/i.test(message)) {
    return { outcome: "missing_user" };
  }

  return {
    outcome: "retry",
    message: sanitizePermanentDeleteErrorMessage(message),
  };
}

export async function finalizeAuthUserDeletion(
  serviceClient: SupabaseClient,
  auditId: string,
  attempt: AuthUserDeletionAttemptResult,
): Promise<"succeeded" | "pending" | "failed"> {
  const outcome =
    attempt.outcome === "succeeded" || attempt.outcome === "missing_user"
      ? attempt.outcome
      : "retry";

  const { data, error } = await serviceClient.rpc("service_finalize_auth_user_deletion", {
    p_audit_id: auditId,
    p_outcome: outcome,
    p_error: attempt.outcome === "retry" ? attempt.message : null,
  });

  if (error) {
    throw new Error(`Auth deletion finalize failed: ${error.message}`);
  }

  const payload = data as Record<string, unknown> | null;
  const status = payload?.auth_delete_status;

  if (status === "succeeded") {
    return "succeeded";
  }

  if (status === "failed") {
    return "failed";
  }

  return "pending";
}

export async function runAuthUserDeletionAttemptForAudit(
  auditId: string,
  profileId: string,
  serviceClient: SupabaseClient = createServiceClient(),
): Promise<"succeeded" | "pending" | "failed"> {
  const attempt = await attemptAuthAdminDeleteUser(profileId, serviceClient);
  return finalizeAuthUserDeletion(serviceClient, auditId, attempt);
}

export async function processAuthUserDeletionCleanup(
  serviceClient: SupabaseClient,
  options: { batchSize?: number; dryRun?: boolean } = {},
): Promise<ProcessAuthDeletionCleanupResult> {
  const batchSize = options.batchSize ?? 10;
  const result: ProcessAuthDeletionCleanupResult = {
    claimed: 0,
    succeeded: 0,
    retried: 0,
    terminalFailed: 0,
  };

  const { data, error } = await serviceClient.rpc("worker_claim_pending_auth_user_deletions", {
    p_limit: batchSize,
  });

  if (error) {
    throw new Error(`Auth deletion cleanup claim failed: ${error.message}`);
  }

  const rows = (data ?? []) as AuthDeletionAuditRow[];
  result.claimed = rows.length;

  if (options.dryRun) {
    console.log(`Dry run: claimed ${rows.length} pending auth deletion(s); Admin API skipped`);
    return result;
  }

  for (const row of rows) {
    const status = await runAuthUserDeletionAttemptForAudit(
      row.id,
      row.deleted_profile_id,
      serviceClient,
    );

    if (status === "succeeded") {
      result.succeeded += 1;
      console.log(
        `Auth deletion cleanup succeeded: profile=${row.deleted_profile_id} email=${row.normalized_email}`,
      );
      continue;
    }

    if (status === "failed") {
      result.terminalFailed += 1;
      console.error(
        `Auth deletion cleanup failed permanently: profile=${row.deleted_profile_id} email=${row.normalized_email}`,
      );
      continue;
    }

    result.retried += 1;
    console.warn(
      `Auth deletion cleanup will retry: profile=${row.deleted_profile_id} email=${row.normalized_email}`,
    );
  }

  return result;
}
