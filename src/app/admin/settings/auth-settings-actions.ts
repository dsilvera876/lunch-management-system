"use server";

import { revalidatePath } from "next/cache";

import { requireAdminOrOwner } from "@/lib/auth";
import { sendEmail } from "@/lib/mail/mail-service";
import { createClient } from "@/lib/supabase/server";

export type SignupEmailDomainRow = {
  domain: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthSettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export type EmailDeliverySettingsView = {
  provider_type: string;
  provider_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: "tls" | "starttls" | "none";
  smtp_username: string;
  smtp_password_configured: boolean;
  from_email: string;
  from_name: string;
  reply_to_email: string | null;
  enabled: boolean;
  updated_at: string;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

export async function fetchSignupEmailDomains(): Promise<SignupEmailDomainRow[]> {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_signup_email_domains");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SignupEmailDomainRow[];
}

export async function addSignupEmailDomain(domain: string): Promise<AuthSettingsActionResult> {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_signup_email_domain", { p_domain: domain });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings/authentication");
  revalidatePath("/admin/settings/system");
  return { success: true };
}

export async function setSignupEmailDomainActive(
  domain: string,
  active: boolean,
): Promise<AuthSettingsActionResult> {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_signup_email_domain_active", {
    p_domain: domain,
    p_active: active,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings/authentication");
  revalidatePath("/admin/settings/system");
  return { success: true };
}

export async function deleteSignupEmailDomain(
  domain: string,
): Promise<AuthSettingsActionResult> {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_signup_email_domain", { p_domain: domain });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings/authentication");
  revalidatePath("/admin/settings/system");
  return { success: true };
}

export async function fetchEmailDeliverySettings(): Promise<EmailDeliverySettingsView | null> {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_email_delivery_settings");

  if (error || !data?.length) {
    return null;
  }

  return data[0] as EmailDeliverySettingsView;
}

export async function saveEmailDeliverySettings(input: {
  providerName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "none";
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  enabled: boolean;
}): Promise<AuthSettingsActionResult> {
  await requireAdminOrOwner();
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_email_delivery_settings", {
    p_provider_type: "smtp",
    p_provider_name: input.providerName,
    p_smtp_host: input.smtpHost,
    p_smtp_port: input.smtpPort,
    p_smtp_security: input.smtpSecurity,
    p_smtp_username: input.smtpUsername,
    p_smtp_password: input.smtpPassword,
    p_from_email: input.fromEmail,
    p_from_name: input.fromName,
    p_reply_to_email: input.replyToEmail,
    p_enabled: input.enabled,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings/email-delivery");
  revalidatePath("/admin/settings/system");
  return { success: true };
}

export async function sendEmailDeliveryTest(
  recipient: string,
): Promise<AuthSettingsActionResult> {
  await requireAdminOrOwner();
  const supabase = await createClient();

  const result = await sendEmail({
    to: recipient,
    subject: "Lunch Management System email test",
    text: "This is a test email from the Lunch Management System email delivery settings.",
    html: "<p>This is a test email from the Lunch Management System email delivery settings.</p>",
  });

  if (!result.success) {
    await supabase.rpc("record_email_delivery_test_result", {
      p_success: false,
      p_error: result.error,
    });
    revalidatePath("/admin/settings/email-delivery");
  revalidatePath("/admin/settings/system");
    return { success: false, error: result.error };
  }

  await supabase.rpc("record_email_delivery_test_result", {
    p_success: true,
    p_error: null,
  });
  revalidatePath("/admin/settings/email-delivery");
  revalidatePath("/admin/settings/system");
  return { success: true };
}
