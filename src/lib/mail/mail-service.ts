import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertEmailDeliveryReady,
  loadEmailDeliveryRuntimeConfig,
} from "@/lib/mail/load-email-delivery-config";
import type { SendEmailInput, SendEmailResult } from "@/lib/mail/email-delivery-types";
import { sendViaSmtpProvider } from "@/lib/mail/smtp-email-provider";
import { createServiceClient } from "@/lib/supabase/service";

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createServiceClient();
  }
  return serviceClient;
}

export type MailServiceDependencies = {
  loadRuntimeConfig?: () => Promise<Awaited<ReturnType<typeof loadEmailDeliveryRuntimeConfig>>>;
  sendSmtp?: typeof sendViaSmtpProvider;
};

export async function sendEmail(
  input: SendEmailInput,
  dependencies: MailServiceDependencies = {},
): Promise<SendEmailResult> {
  const loadRuntimeConfig =
    dependencies.loadRuntimeConfig ??
    (async () => loadEmailDeliveryRuntimeConfig(getServiceClient()));
  const sendSmtp = dependencies.sendSmtp ?? sendViaSmtpProvider;

  const runtime = await loadRuntimeConfig();
  const ready = assertEmailDeliveryReady(runtime);
  if (!ready.ok) {
    return { success: false, error: ready.error };
  }

  if (ready.config.providerType !== "smtp") {
    return { success: false, error: "Unsupported email provider type." };
  }

  return sendSmtp(ready.config, input);
}
