"use server";

import { revalidatePath } from "next/cache";
import { requireManageStaffAccounts } from "@/lib/auth";
import { getApplicationOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildAccountSetupEmailContent } from "@/lib/mail/account-setup-email";
import { enqueueEmailDelivery } from "@/lib/mail/enqueue-email-delivery";
import {
  orchestrateSignupRequestInvite,
  type AccountSetupEmailQueueClient,
  type AdminInviteClient,
  type SignupInviteDbClient,
  type SignupRequestInviteState,
} from "@/lib/signup-request-invite";
import { orchestrateSignupRequestCancellation } from "@/lib/cancel-signup-request";
import type { SignupCancellationReason } from "@/lib/signup-request-cancellation";
import type { SignupRequestRow } from "@/lib/signup-request-presentation";

export type SearchSignupRequestsResult =
  | { success: true; rows: SignupRequestRow[]; totalCount: number }
  | { success: false; error: "search" | "unauthorized" };

export type MutateSignupRequestResult =
  | { success: true; warning?: string }
  | { success: false; error: string };

const PROFILE_LOOKUP_ATTEMPTS = 5;
const PROFILE_LOOKUP_BASE_DELAY_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapSignupRequestRow(raw: Record<string, unknown>): SignupRequestRow {
  return {
    request_id: String(raw.request_id),
    full_name: String(raw.full_name),
    email: String(raw.email),
    status: raw.status as SignupRequestRow["status"],
    requested_at: String(raw.requested_at),
    requested_employee_id: (raw.requested_employee_id as string | null) ?? null,
    created_profile_id: (raw.created_profile_id as string | null) ?? null,
    invite_sent_at: (raw.invite_sent_at as string | null) ?? null,
    invite_last_error: (raw.invite_last_error as string | null) ?? null,
    cancelled_at: (raw.cancelled_at as string | null) ?? null,
    cancellation_reason: (raw.cancellation_reason as string | null) ?? null,
    cancellation_note: (raw.cancellation_note as string | null) ?? null,
    onboarding_established: raw.onboarding_established === true,
    total_count: Number(raw.total_count ?? 0),
  };
}

function mapGetSignupRequestRow(raw: Record<string, unknown>): SignupRequestInviteState {
  return {
    requestId: String(raw.request_id),
    email: String(raw.email),
    fullName: String(raw.full_name),
    status: raw.status as SignupRequestInviteState["status"],
    createdProfileId: (raw.created_profile_id as string | null) ?? null,
    requestedEmployeeId: (raw.requested_employee_id as string | null) ?? null,
  };
}

function createInviteDbClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  service: ReturnType<typeof createServiceClient>,
): SignupInviteDbClient {
  return {
    async getRequest(requestId) {
      const { data, error } = await supabase.rpc("get_signup_request", {
        p_request_id: requestId,
      });

      if (error || !data?.length) {
        return null;
      }

      return mapGetSignupRequestRow(data[0] as Record<string, unknown>);
    },
    async markApproved(requestId, employeeId) {
      const { data, error } = await supabase.rpc("mark_signup_request_approved", {
        p_request_id: requestId,
        p_employee_id: employeeId,
      });

      if (error || !data?.length) {
        return { ok: false, errorMessage: error?.message ?? "Approval failed" };
      }

      const row = data[0] as Record<string, unknown>;
      return {
        ok: true,
        row: {
          email: String(row.email),
          fullName: String(row.full_name),
          status: String(row.status),
          createdProfileId: (row.created_profile_id as string | null) ?? null,
          requestedEmployeeId: (row.requested_employee_id as string | null) ?? null,
        },
      };
    },
    async lookupProfileIdByEmail(email) {
      const { data, error } = await service.rpc("service_lookup_profile_id_by_signup_email", {
        p_email: email,
      });

      if (error || !data) {
        return null;
      }

      return String(data);
    },
    async waitForProfileId(userId) {
      for (let attempt = 0; attempt < PROFILE_LOOKUP_ATTEMPTS; attempt += 1) {
        const { data } = await service
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (data?.id) {
          return String(data.id);
        }

        await delay(PROFILE_LOOKUP_BASE_DELAY_MS * (attempt + 1));
      }

      return null;
    },
    async recordInviteFailure(requestId, message) {
      await supabase.rpc("link_signup_request_profile", {
        p_request_id: requestId,
        p_profile_id: null,
        p_invite_error: message,
      });
    },
    async linkProfile(requestId, profileId) {
      const { error } = await supabase.rpc("link_signup_request_profile", {
        p_request_id: requestId,
        p_profile_id: profileId,
        p_invite_error: null,
      });

      if (error) {
        return { ok: false, errorMessage: error.message };
      }

      return { ok: true };
    },
    async setEmployeeId(profileId, employeeId) {
      const { error } = await supabase.rpc("set_employee_id", {
        p_profile_id: profileId,
        p_employee_id: employeeId,
      });

      if (error) {
        return { ok: false, errorMessage: error.message };
      }

      return { ok: true };
    },
  };
}

function createAdminInviteClient(service: ReturnType<typeof createServiceClient>): AdminInviteClient {
  return {
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

      const properties = result.data?.properties as
        | { hashed_token?: string; action_link?: string }
        | undefined;
      const tokenHash = properties?.hashed_token?.trim() ?? "";

      if (result.error || !result.data?.user?.id || !tokenHash) {
        return {
          data: result.data?.user?.id
            ? { user: { id: result.data.user.id }, tokenHash }
            : null,
          error: {
            message: result.error?.message ?? "Invite link could not be generated.",
          },
        };
      }

      return {
        data: { user: { id: result.data.user.id }, tokenHash },
        error: null,
      };
    },
  };
}

function createAccountSetupQueueClient(
  service: ReturnType<typeof createServiceClient>,
): AccountSetupEmailQueueClient {
  return {
    async enqueueAccountSetupInvite(input) {
      const content = buildAccountSetupEmailContent({
        to: input.to,
        fullName: input.fullName,
        setupUrl: input.setupUrl,
      });

      const result = await enqueueEmailDelivery(service, {
        messageType: "account_setup_invite",
        recipientEmail: input.to,
        subject: content.subject,
        textBody: content.text,
        htmlBody: content.html,
        correlationType: "signup_request",
        correlationId: input.requestId,
        supersedeActive: true,
      });

      if (!result.success) {
        return { ok: false, errorMessage: result.error };
      }

      return { ok: true };
    },
  };
}

async function runSignupInviteOrchestration(input: {
  requestId: string;
  employeeId: string;
}): Promise<MutateSignupRequestResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const service = createServiceClient();
  const redirectTo = `${getApplicationOrigin()}/account/update-password?invite=1`;

  const result = await orchestrateSignupRequestInvite({
    db: createInviteDbClient(supabase, service),
    admin: createAdminInviteClient(service),
    queue: createAccountSetupQueueClient(service),
    requestId: input.requestId,
    employeeIdInput: input.employeeId,
    redirectTo,
  });

  revalidatePath("/admin/users");

  if (result.success) {
    return { success: true, warning: result.warning };
  }

  return { success: false, error: result.error };
}

export async function fetchPendingSignupRequestCount(): Promise<number> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_pending_signup_requests");

  if (error || data === null) {
    return 0;
  }

  return Number(data);
}

export async function searchSignupRequests(input: {
  search: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  page: number;
  pageSize: number;
}): Promise<SearchSignupRequestsResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const offset = Math.max(0, (input.page - 1) * input.pageSize);

  const { data, error } = await supabase.rpc("search_signup_requests", {
    p_search: input.search.trim().length > 0 ? input.search.trim() : null,
    p_status: input.status,
    p_limit: input.pageSize,
    p_offset: offset,
  });

  if (error || !data) {
    return { success: false, error: "search" };
  }

  const rows = (data as Record<string, unknown>[]).map(mapSignupRequestRow);
  const totalCount = rows[0]?.total_count ?? 0;

  return { success: true, rows, totalCount };
}

export async function rejectSignupRequest(input: {
  requestId: string;
  rejectionReason?: string;
}): Promise<MutateSignupRequestResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_signup_request", {
    p_request_id: input.requestId,
    p_rejection_reason: input.rejectionReason?.trim() || null,
  });

  if (error) {
    return { success: false, error: "Unable to reject this request." };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function approveSignupRequest(input: {
  requestId: string;
  employeeId: string;
}): Promise<MutateSignupRequestResult> {
  return runSignupInviteOrchestration(input);
}

export async function retrySignupRequestInvitation(input: {
  requestId: string;
  employeeId: string;
}): Promise<MutateSignupRequestResult> {
  return runSignupInviteOrchestration(input);
}

export async function cancelSignupRequest(input: {
  requestId: string;
  reason: SignupCancellationReason;
  note?: string;
}): Promise<MutateSignupRequestResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const result = await orchestrateSignupRequestCancellation({
    supabase,
    requestId: input.requestId,
    reason: input.reason,
    note: input.note,
  });

  if (!result.success) {
    return { success: false, error: result.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}
