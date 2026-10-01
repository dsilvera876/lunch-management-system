"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrOwner } from "@/lib/auth";
import { sendEmail } from "@/lib/mail/mail-service";
import {
  renderNotificationTemplate,
  TODAY_MENU_SAMPLE_TEXT_VARIABLES,
  TODAY_MENU_SAMPLE_VARIABLES,
  validateNotificationTemplateVariables,
} from "@/lib/notification-template";
import {
  DEADLINE_REMINDER_OFFSET_MAX_MINUTES,
  DEADLINE_REMINDER_OFFSET_MIN_MINUTES,
  EMAIL_SETTINGS_PATH,
  EMAIL_TEMPLATES_PATH,
  parseNotificationSendTimeForSave,
} from "@/lib/notification-presentation";
import { createClient } from "@/lib/supabase/server";

export async function updateNotificationGlobalSettingAction(input: {
  eventKey: string;
  enabled: boolean;
  sendTime?: string | null;
  minutesBeforeDeadline?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminOrOwner();
  const supabase = await createClient();

  let sendTime: string | null = null;
  if (input.sendTime !== undefined && input.sendTime !== null) {
    sendTime = parseNotificationSendTimeForSave(input.sendTime);
    if (!sendTime) {
      return { ok: false, error: "Enter a valid send time." };
    }
  }

  let minutesBeforeDeadline: number | null = null;
  if (input.minutesBeforeDeadline !== undefined && input.minutesBeforeDeadline !== null) {
    if (
      !Number.isInteger(input.minutesBeforeDeadline) ||
      input.minutesBeforeDeadline < DEADLINE_REMINDER_OFFSET_MIN_MINUTES ||
      input.minutesBeforeDeadline > DEADLINE_REMINDER_OFFSET_MAX_MINUTES
    ) {
      return {
        ok: false,
        error: `Reminder offset must be between ${DEADLINE_REMINDER_OFFSET_MIN_MINUTES} and ${DEADLINE_REMINDER_OFFSET_MAX_MINUTES} minutes.`,
      };
    }
    minutesBeforeDeadline = input.minutesBeforeDeadline;
  }

  const { error } = await supabase.rpc("update_notification_global_setting", {
    p_event_key: input.eventKey,
    p_enabled: input.enabled,
    p_send_time: sendTime,
    p_minutes_before_deadline: minutesBeforeDeadline,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(EMAIL_SETTINGS_PATH);
  return { ok: true };
}

export async function saveNotificationTemplateAction(input: {
  eventKey: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminOrOwner();
  const supabase = await createClient();

  const { data, error: loadError } = await supabase.rpc("get_notification_email_template", {
    p_event_key: input.eventKey,
  });

  if (loadError) {
    return { ok: false, error: loadError.message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const allowed = (row?.allowed_variables as string[] | undefined) ?? [];
  const invalid = validateNotificationTemplateVariables(
    allowed,
    input.subjectTemplate,
    input.bodyHtmlTemplate,
    input.bodyTextTemplate,
  );

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Unsupported template variables: ${invalid.join(", ")}`,
    };
  }

  const { error } = await supabase.rpc("upsert_notification_email_template", {
    p_event_key: input.eventKey,
    p_subject_template: input.subjectTemplate,
    p_body_html_template: input.bodyHtmlTemplate,
    p_body_text_template: input.bodyTextTemplate ?? null,
    p_active: true,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(EMAIL_TEMPLATES_PATH);
  revalidatePath(`${EMAIL_TEMPLATES_PATH}/${input.eventKey}`);
  return { ok: true };
}

export async function sendNotificationTemplateTestEmailAction(input: {
  eventKey: string;
  recipientEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminOrOwner();
  const supabase = await createClient();

  const { data, error: loadError } = await supabase.rpc("get_notification_email_template", {
    p_event_key: input.eventKey,
  });

  if (loadError) {
    return { ok: false, error: loadError.message };
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row) {
    return { ok: false, error: "Template not found." };
  }

  const sample =
    input.eventKey === "staff.today_menu"
      ? TODAY_MENU_SAMPLE_VARIABLES
      : TODAY_MENU_SAMPLE_VARIABLES;

  const sampleText =
    input.eventKey === "staff.today_menu"
      ? TODAY_MENU_SAMPLE_TEXT_VARIABLES
      : TODAY_MENU_SAMPLE_TEXT_VARIABLES;

  const subject = renderNotificationTemplate(String(row.subject_template), sample);
  const html = renderNotificationTemplate(String(row.body_html_template), sample);
  const text = renderNotificationTemplate(
    String(row.body_text_template ?? row.body_html_template),
    sampleText,
  );

  const result = await sendEmail({
    to: input.recipientEmail.trim(),
    subject: `[TEST] ${subject}`,
    html,
    text,
  });

  if (!result.success) {
    return { ok: false, error: result.error ?? "Unable to send test email." };
  }

  return { ok: true };
}
