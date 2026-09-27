import { buildAuthConfirmUrl, buildAuthEmailContent } from "@/lib/mail/auth-email-templates";
import type { SendEmailResult } from "@/lib/mail/email-delivery-types";
import type { MailServiceDependencies } from "@/lib/mail/mail-service";
import { sendEmail } from "@/lib/mail/mail-service";
import { getApplicationOrigin } from "@/lib/request-origin";

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

function buildRecipientMessages(payload: AuthSendEmailHookPayload): Array<{
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

export async function processAuthSendEmailHook(
  payload: AuthSendEmailHookPayload,
  dependencies: MailServiceDependencies = {},
): Promise<SendEmailResult> {
  const applicationOrigin = getApplicationOrigin();
  const messages = buildRecipientMessages(payload);

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

    const result = await sendEmail(
      {
        to: message.to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      },
      dependencies,
    );

    if (!result.success) {
      return result;
    }
  }

  return { success: true };
}
