import nodemailer from "nodemailer";

import type {
  EmailDeliveryRuntimeConfig,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/mail/email-delivery-types";

const EMAIL_TIMEOUT_MS = 30_000;

function buildFromAddress(config: EmailDeliveryRuntimeConfig): string {
  const email = config.fromEmail.trim();
  const name = config.fromName.trim();
  if (name) {
    return `"${name.replace(/"/g, "")}" <${email}>`;
  }
  return email;
}

export async function sendViaSmtpProvider(
  config: EmailDeliveryRuntimeConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!input.to.trim() || !input.subject.trim()) {
    return { success: false, error: "Invalid email recipient or subject." };
  }

  const secure = config.smtpSecurity === "tls";
  const requireTls = config.smtpSecurity === "starttls";

  const transporter = nodemailer.createTransport({
    host: config.smtpHost.trim(),
    port: config.smtpPort,
    secure,
    requireTLS: requireTls,
    auth: {
      user: config.smtpUsername.trim(),
      pass: config.smtpPassword?.trim() ?? "",
    },
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
  });

  try {
    const info = await transporter.sendMail({
      from: buildFromAddress(config),
      to: input.to.trim(),
      subject: input.subject.trim(),
      text: input.text,
      html: input.html?.trim() || undefined,
      replyTo: input.replyTo?.trim() || config.replyToEmail?.trim() || undefined,
    });

    const metadata: Record<string, unknown> = {};
    if (info.messageId) {
      metadata.message_id = info.messageId;
    }

    return {
      success: true,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch {
    return {
      success: false,
      error: "Unable to deliver email through the configured SMTP provider.",
      ambiguous: true,
    };
  }
}
