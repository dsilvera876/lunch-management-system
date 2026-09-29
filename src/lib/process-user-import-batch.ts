import type { SupabaseClient } from "@supabase/supabase-js";

import { getApplicationOrigin } from "@/lib/request-origin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  orchestrateSignupRequestInvite,
  type AccountSetupEmailQueueClient,
  type AdminInviteClient,
  type SignupInviteDbClient,
} from "@/lib/signup-request-invite";
import {
  classifyUserImportRuntimeError,
  logUserImportRuntimeError,
} from "@/lib/user-import-runtime-errors";
import { enqueueEmailDelivery } from "@/lib/mail/enqueue-email-delivery";
import { buildAccountSetupEmailContent } from "@/lib/mail/account-setup-email";

export type UserImportRowRecord = {
  id: string;
  batch_id: string;
  row_number: number;
  full_name: string;
  email: string;
  normalized_email: string;
  employee_id: string | null;
  classification: string;
  action_code: string;
  profile_id: string | null;
  signup_request_id: string | null;
};

const INVITE_REDIRECT = "/account/update-password?invite=1";

function importRowFailure(
  row: UserImportRowRecord,
  technicalMessage: string,
): { outcome: "failed"; message: string } {
  const classified = classifyUserImportRuntimeError({
    technicalMessage,
    employeeId: row.employee_id,
  });
  logUserImportRuntimeError({
    rowNumber: row.row_number,
    email: row.email,
    code: classified.code,
    technicalMessage,
  });
  return { outcome: "failed", message: classified.userMessage };
}

function createWorkerInviteClients(
  service: SupabaseClient,
): { admin: AdminInviteClient; queue: AccountSetupEmailQueueClient; db: SignupInviteDbClient } {
  const db: SignupInviteDbClient = {
    async getRequest(requestId) {
      const { data } = await service.rpc("get_signup_request", { p_request_id: requestId });
      if (!data?.[0]) return null;
      const row = data[0] as Record<string, unknown>;
      return {
        requestId: String(row.request_id),
        email: String(row.email),
        fullName: String(row.full_name),
        status: row.status as "pending" | "approved" | "rejected",
        createdProfileId: (row.created_profile_id as string | null) ?? null,
        requestedEmployeeId: (row.requested_employee_id as string | null) ?? null,
      };
    },
    async markApproved(requestId, employeeId) {
      const { error } = await service.rpc("authorize_rejected_signup_for_bulk_import", {
        p_request_id: requestId,
        p_employee_id: employeeId,
      });
      if (error) {
        return { ok: false, errorMessage: error.message };
      }
      const refreshed = await db.getRequest(requestId);
      if (!refreshed) {
        return { ok: false, errorMessage: "Signup request not found after authorization." };
      }
      return {
        ok: true,
        row: {
          email: refreshed.email,
          fullName: refreshed.fullName,
          status: refreshed.status,
          createdProfileId: refreshed.createdProfileId,
          requestedEmployeeId: refreshed.requestedEmployeeId,
        },
      };
    },
    async lookupProfileIdByEmail(email) {
      const { data } = await service.rpc("service_lookup_profile_id_by_signup_email", {
        p_email: email,
      });
      return data ? String(data) : null;
    },
    async waitForProfileId(userId) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data } = await service.from("profiles").select("id").eq("id", userId).maybeSingle();
        if (data?.id) return String(data.id);
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
      return userId;
    },
    async recordInviteFailure(requestId, message) {
      await service.rpc("link_signup_request_profile", {
        p_request_id: requestId,
        p_profile_id: null,
        p_invite_error: message,
      });
    },
    async linkProfile(requestId, profileId) {
      const { error } = await service.rpc("link_signup_request_profile", {
        p_request_id: requestId,
        p_profile_id: profileId,
        p_invite_error: null,
      });
      return error ? { ok: false, errorMessage: error.message } : { ok: true };
    },
    async setEmployeeId(profileId, employeeId) {
      const { error } = await service.rpc("service_set_employee_id_for_bulk_import", {
        p_profile_id: profileId,
        p_employee_id: employeeId,
      });
      if (error) {
        return { ok: false, errorMessage: error.message };
      }
      return { ok: true };
    },
  };

  return {
    admin: {
      async inviteUserByEmail(email, options) {
        const result = await service.auth.admin.inviteUserByEmail(email, options);
        return {
          data: { user: result.data.user ? { id: result.data.user.id } : null },
          error: result.error ? { message: result.error.message } : null,
        };
      },
      async generateInviteLink(email, options) {
        const result = await service.auth.admin.generateLink({
          type: "invite",
          email,
          options,
        });
        const properties = result.data?.properties as { hashed_token?: string } | undefined;
        const user = result.data?.user as { id: string } | undefined;
        return {
          data:
            properties?.hashed_token && user?.id
              ? { user: { id: user.id }, tokenHash: properties.hashed_token }
              : null,
          error: result.error ? { message: result.error.message } : null,
        };
      },
    },
    queue: {
      async enqueueAccountSetupInvite(input) {
        const content = buildAccountSetupEmailContent({
          to: input.to,
          fullName: input.fullName,
          setupUrl: input.setupUrl,
        });
        const queued = await enqueueEmailDelivery(service, {
          messageType: "account_setup_invite",
          recipientEmail: input.to,
          subject: content.subject,
          textBody: content.text,
          htmlBody: content.html,
          correlationType: "signup_request",
          correlationId: input.requestId,
          supersedeActive: true,
        });
        return queued.success
          ? { ok: true }
          : { ok: false, errorMessage: queued.error ?? "Queue failed" };
      },
    },
    db,
  };
}

async function resolveSignupRequestId(
  service: SupabaseClient,
  row: UserImportRowRecord,
): Promise<string> {
  if (row.signup_request_id) {
    return row.signup_request_id;
  }

  const { data, error } = await service.rpc("ensure_signup_request_for_bulk_import", {
    p_email: row.email,
    p_full_name: row.full_name,
    p_employee_id: row.employee_id,
  });

  if (error || !data) {
    throw new Error("Unable to prepare signup authorization for external import.");
  }

  return String(data);
}

async function processImportRow(
  service: SupabaseClient,
  row: UserImportRowRecord,
): Promise<{ outcome: "succeeded" | "skipped" | "failed"; message: string; profileId?: string; signupRequestId?: string }> {
  if (row.classification === "existing_inactive") {
    return {
      outcome: "skipped",
      message: "Existing inactive user — review required.",
    };
  }

  if (row.action_code === "update_existing") {
    const profileId =
      row.profile_id ??
      (await service.rpc("service_lookup_profile_id_by_signup_email", { p_email: row.email }).then(
        (result) => (result.data ? String(result.data) : null),
      ));

    if (!profileId) {
      return importRowFailure(row, "Matched user could not be found during import.");
    }

    const { error } = await service.rpc("service_apply_user_import_profile_update", {
      p_import_row_id: row.id,
      p_full_name: row.full_name,
      p_employee_id: row.employee_id,
    });

    if (error) {
      return importRowFailure(row, error.message ?? "Unable to update existing user profile.");
    }

    return { outcome: "succeeded", message: "Updated existing user profile.", profileId };
  }

  const clients = createWorkerInviteClients(service);
  const redirectTo = `${getApplicationOrigin()}${INVITE_REDIRECT}`;
  let requestId = row.signup_request_id;

  if (row.classification === "new_company") {
    requestId = await resolveSignupRequestId(service, row);
  } else if (
    row.classification === "new_external" ||
    row.classification === "pending_signup" ||
    row.classification === "approved_incomplete" ||
    row.classification === "previously_rejected"
  ) {
    requestId = await resolveSignupRequestId(service, {
      ...row,
      signup_request_id: row.signup_request_id ?? null,
    });
  }

  if (!requestId) {
    return importRowFailure(row, "Signup authorization could not be established.");
  }

  const { error: authorizeError } = await service.rpc("authorize_rejected_signup_for_bulk_import", {
    p_request_id: requestId,
    p_employee_id: row.employee_id,
  });

  if (authorizeError) {
    return importRowFailure(row, authorizeError.message);
  }

  const inviteResult = await orchestrateSignupRequestInvite({
    db: clients.db,
    admin: clients.admin,
    queue: clients.queue,
    requestId,
    employeeIdInput: row.employee_id ?? "",
    redirectTo,
  });

  if (!inviteResult.success) {
    return importRowFailure(row, inviteResult.error);
  }

  const profileId = await clients.db.lookupProfileIdByEmail(row.email);

  return {
    outcome: "succeeded",
    message: inviteResult.warning ?? "Created — invitation queued.",
    profileId: profileId ?? undefined,
    signupRequestId: requestId,
  };
}

export async function processUserImportBatch(
  serviceClient: SupabaseClient = createServiceClient(),
  options: { batchSize?: number } = {},
): Promise<{ claimed: number; succeeded: number; failed: number; skipped: number }> {
  const result = { claimed: 0, succeeded: 0, failed: 0, skipped: 0 };

  const { data, error } = await serviceClient.rpc("worker_claim_user_import_rows", {
    p_limit: options.batchSize ?? 5,
  });

  if (error) {
    throw new Error(`User import claim failed: ${error.message}`);
  }

  const rows = (data ?? []) as UserImportRowRecord[];
  result.claimed = rows.length;

  for (const row of rows) {
    try {
      const processed = await processImportRow(serviceClient, row);
      await serviceClient.rpc("worker_complete_user_import_row", {
        p_row_id: row.id,
        p_outcome: processed.outcome,
        p_profile_id: processed.profileId ?? null,
        p_signup_request_id: processed.signupRequestId ?? null,
        p_message: processed.message,
      });

      if (processed.outcome === "succeeded") result.succeeded += 1;
      else if (processed.outcome === "skipped") result.skipped += 1;
      else result.failed += 1;
    } catch (caught) {
      const technicalMessage =
        caught instanceof Error ? caught.message : "Import row failed unexpectedly.";
      const failed = importRowFailure(row, technicalMessage);
      await serviceClient.rpc("worker_complete_user_import_row", {
        p_row_id: row.id,
        p_outcome: "failed",
        p_profile_id: null,
        p_signup_request_id: null,
        p_message: failed.message,
      });
      result.failed += 1;
    }
  }

  return result;
}
