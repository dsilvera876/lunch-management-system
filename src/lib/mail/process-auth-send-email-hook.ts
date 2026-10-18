import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAccountSetupEmailContent } from "@/lib/mail/account-setup-email";
import { buildAuthConfirmUrl, buildAuthEmailContent } from "@/lib/mail/auth-email-templates";
import {
  enqueueOrdinaryRecoveryEmail,
  enqueueSignupRecoveryEmail,
} from "@/lib/mail/enqueue-auth-recovery-email";
import { enqueueEmailDelivery } from "@/lib/mail/enqueue-email-delivery";
import type { SendEmailResult } from "@/lib/mail/email-delivery-types";
import { getApplicationOrigin } from "@/lib/request-origin";
import { verifyAccountSetupRecoveryPurpose } from "@/lib/signup-recovery-purpose";
import { createServiceClient } from "@/lib/supabase/service";

export type AuthSendEmailHookPayload = {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: { full_name?: string };
  };
  email_data: {
    token: string;
    token_hash: string;
    token_new: string;
    token_hash_new: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
};

export type AuthHookEnqueueDependencies = {
  getServiceClient?: () => SupabaseClient;
  enqueue?: typeof enqueueEmailDelivery;
  enqueueSignupRecovery?: typeof enqueueSignupRecoveryEmail;
  enqueueOrdinaryRecovery?: typeof enqueueOrdinaryRecoveryEmail;
  recoveryPurposeSecret?: string;
  nowMs?: number;
};

export function getSignupRecoveryNonce(
  payload: AuthSendEmailHookPayload,
  applicationOrigin = getApplicationOrigin(),
  options: { secret?: string; nowMs?: number } = {},
): string | null {
  if (payload.email_data.email_action_type !== "recovery") {
    return null;
  }

  return verifyAccountSetupRecoveryPurpose(
    {
      recipientEmail: payload.user.email,
      expectedAuthUserId: payload.user.id,
      redirectTo: payload.email_data.redirect_to,
      applicationOrigin,
    },
    options,
  )?.nonce ?? null;
}

export function buildAuthSendEmailHookMessages(payload: AuthSendEmailHookPayload): Array<{
  to: string;
  tokenHash: string;
  actionType: string;
  otpCode?: string;
}> {
  const { user, email_data: emailData } = payload;
  const actionType = emailData.email_action_type;

  if (actionType === "email_change" && emailData.token_hash_new && user.new_email) {
    return [
      {
        to: user.email,
        tokenHash: emailData.token_hash_new,
        actionType,
        otpCode: emailData.token,
      },
      {
        to: user.new_email,
        tokenHash: emailData.token_hash,
        actionType,
        otpCode: emailData.token_new,
      },
    ];
  }

  return [
    {
      to: user.email,
      tokenHash: emailData.token_hash || emailData.token_hash_new,
      actionType,
      otpCode: emailData.token,
    },
  ];
}

export async function enqueueAuthSendEmailHook(
  payload: AuthSendEmailHookPayload,
  dependencies: AuthHookEnqueueDependencies = {},
): Promise<SendEmailResult> {
  const applicationOrigin = getApplicationOrigin();
  const messages = buildAuthSendEmailHookMessages(payload);
  const supabase = dependencies.getServiceClient?.() ?? createServiceClient();
  const enqueue = dependencies.enqueue ?? enqueueEmailDelivery;
  const enqueueSignupRecovery =
    dependencies.enqueueSignupRecovery ?? enqueueSignupRecoveryEmail;
  const enqueueOrdinaryRecovery =
    dependencies.enqueueOrdinaryRecovery ?? enqueueOrdinaryRecoveryEmail;
  const recoveryNonce = getSignupRecoveryNonce(payload, applicationOrigin, {
    secret: dependencies.recoveryPurposeSecret,
    nowMs: dependencies.nowMs,
  });

  for (const message of messages) {
    if (message.actionType === "recovery" && recoveryNonce !== null) {
      const confirmUrl = buildAuthConfirmUrl({
        tokenHash: message.tokenHash,
        actionType: message.actionType,
        redirectTo: `${applicationOrigin}/account/update-password?invite=1&setup_nonce=${encodeURIComponent(recoveryNonce)}`,
        applicationOrigin,
      });
      const content = buildAccountSetupEmailContent({
        to: message.to,
        fullName: payload.user.user_metadata?.full_name ?? "",
        setupUrl: confirmUrl,
      });
      const result = await enqueueSignupRecovery(supabase, {
        nonce: recoveryNonce,
        authUserId: payload.user.id,
        recipientEmail: message.to,
        tokenHash: message.tokenHash,
        subject: content.subject,
        textBody: content.text,
        htmlBody: content.html,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }
      if (result.outcome === "queued") {
        continue;
      }
    }

    const confirmUrl = buildAuthConfirmUrl({
      tokenHash: message.tokenHash,
      actionType: message.actionType,
      redirectTo: message.actionType === "recovery" ? undefined : payload.email_data.redirect_to,
      applicationOrigin,
    });

    const content = buildAuthEmailContent({
      actionType: message.actionType,
      confirmUrl,
      otpCode: message.otpCode,
    });

    if (message.actionType === "recovery") {
      const result = await enqueueOrdinaryRecovery(supabase, {
        authUserId: payload.user.id,
        recipientEmail: message.to,
        tokenHash: message.tokenHash,
        subject: content.subject,
        textBody: content.text,
        htmlBody: content.html,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }
      continue;
    }

    const result = await enqueue(supabase, {
      messageType: "auth_hook",
      recipientEmail: message.to,
      subject: content.subject,
      textBody: content.text,
      htmlBody: content.html,
      correlationType: "verified_auth_hook",
      correlationId: payload.user.id,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }
  }

  return { success: true };
}

/** @deprecated Use enqueueAuthSendEmailHook — Auth hooks must not send SMTP synchronously. */
export async function processAuthSendEmailHook(
  payload: AuthSendEmailHookPayload,
  dependencies: AuthHookEnqueueDependencies = {},
): Promise<SendEmailResult> {
  return enqueueAuthSendEmailHook(payload, dependencies);
}
