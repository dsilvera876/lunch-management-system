import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailDeliveryRuntimeConfig, SmtpSecurityMode } from "@/lib/mail/email-delivery-types";

type RuntimeRow = {
  provider_type: string;
  provider_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: SmtpSecurityMode;
  smtp_username: string;
  smtp_password: string | null;
  from_email: string;
  from_name: string;
  reply_to_email: string | null;
  enabled: boolean;
};

function mapRuntimeRow(row: RuntimeRow): EmailDeliveryRuntimeConfig {
  return {
    providerType: "smtp",
    providerName: row.provider_name,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security,
    smtpUsername: row.smtp_username,
    smtpPassword: row.smtp_password,
    fromEmail: row.from_email,
    fromName: row.from_name,
    replyToEmail: row.reply_to_email,
    enabled: row.enabled,
  };
}

function isRuntimeConfigUsable(config: EmailDeliveryRuntimeConfig): boolean {
  return (
    config.enabled &&
    config.smtpHost.trim().length > 0 &&
    config.fromEmail.trim().length > 0 &&
    Boolean(config.smtpPassword?.trim())
  );
}

export async function loadEmailDeliveryRuntimeConfig(
  service: SupabaseClient,
): Promise<EmailDeliveryRuntimeConfig | null> {
  const { data, error } = await service.rpc("service_get_email_delivery_runtime");

  if (error || !data?.length) {
    return null;
  }

  return mapRuntimeRow(data[0] as RuntimeRow);
}

export function isEmailDeliveryRuntimeUsable(config: EmailDeliveryRuntimeConfig | null): boolean {
  return config !== null && isRuntimeConfigUsable(config);
}

export function assertEmailDeliveryReady(
  config: EmailDeliveryRuntimeConfig | null,
): { ok: true; config: EmailDeliveryRuntimeConfig } | { ok: false; error: string } {
  if (!config) {
    return { ok: false, error: "Email delivery is not configured." };
  }

  if (!config.enabled) {
    return { ok: false, error: "Email delivery is disabled." };
  }

  if (!config.smtpHost.trim() || !config.fromEmail.trim()) {
    return { ok: false, error: "Email delivery settings are incomplete." };
  }

  if (!config.smtpPassword?.trim()) {
    return { ok: false, error: "Email credentials are not configured." };
  }

  return { ok: true, config };
}
