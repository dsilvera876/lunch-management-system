import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAuthConfirmUrl, buildAuthEmailContent } from "@/lib/mail/auth-email-templates";
import { enqueueEmailDelivery } from "@/lib/mail/enqueue-email-delivery";
import type { SendEmailResult } from "@/lib/mail/email-delivery-types";
import { getApplicationOrigin } from "@/lib/request-origin";
import { createServiceClient } from "@/lib/supabase/service";

export type AuthSendEmailHookPayload = {
  user: {
    email: string;
    new_email?: string;
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
};

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

  for (const message of messages) {
    const confirmUrl = buildAuthConfirmUrl({
      tokenHash: message.tokenHash,
      actionType: message.actionType,
      redirectTo: payload.email_data.redirect_to,
      applicationOrigin,
    });

    const content = buildAuthEmailContent({
      actionType: message.actionType,
      confirmUrl,
      otpCode: message.otpCode,
    });

    const result = await enqueue(supabase, {
      messageType: "auth_hook",
      recipientEmail: message.to,
      subject: content.subject,
      textBody: content.text,
      htmlBody: content.html,
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
