import type { SupabaseClient } from "@supabase/supabase-js";

import type { EnqueueEmailDeliveryResult } from "@/lib/mail/enqueue-email-delivery";

type AuthRecoveryEmailInput = {
  authUserId: string;
  recipientEmail: string;
  tokenHash: string;
  subject: string;
  textBody: string;
  htmlBody: string;
};

export type EnqueueSignupRecoveryEmailResult =
  | { success: true; outcome: "queued"; queueId: string }
  | { success: true; outcome: "ordinary" }
  | { success: false; error: string };

export async function enqueueSignupRecoveryEmail(
  supabase: SupabaseClient,
  input: AuthRecoveryEmailInput & { nonce: string },
): Promise<EnqueueSignupRecoveryEmailResult> {
  const { data, error } = await supabase.rpc("service_enqueue_signup_recovery_email", {
    p_nonce: input.nonce,
    p_auth_user_id: input.authUserId,
    p_recipient_email: input.recipientEmail,
    p_token_hash: input.tokenHash,
    p_subject: input.subject,
    p_text_body: input.textBody,
    p_html_body: input.htmlBody,
  });

  if (error || !data || typeof data !== "object") {
    return {
      success: false,
      error: error?.message ?? "Unable to enqueue account setup recovery email.",
    };
  }

  const outcome = String((data as Record<string, unknown>).outcome ?? "");
  if (outcome === "ordinary") {
    return { success: true, outcome };
  }

  const queueId = String((data as Record<string, unknown>).queue_id ?? "");
  if (outcome !== "queued" || !queueId) {
    return { success: false, error: "Unexpected account setup recovery queue response." };
  }

  return { success: true, outcome, queueId };
}

export async function enqueueOrdinaryRecoveryEmail(
  supabase: SupabaseClient,
  input: AuthRecoveryEmailInput,
): Promise<EnqueueEmailDeliveryResult> {
  const { data, error } = await supabase.rpc("service_enqueue_ordinary_recovery_email", {
    p_auth_user_id: input.authUserId,
    p_recipient_email: input.recipientEmail,
    p_token_hash: input.tokenHash,
    p_subject: input.subject,
    p_text_body: input.textBody,
    p_html_body: input.htmlBody,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Unable to enqueue password recovery email.",
    };
  }

  return { success: true, queueId: String(data) };
}
