import { NotificationTemplateEditor } from "@/components/admin/notification-template-editor";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ eventKey: string }>;
};

export default async function EditNotificationTemplatePage({ params }: Props) {
  await requireAdminOrOwner();
  const { eventKey: rawKey } = await params;
  const eventKey = decodeURIComponent(rawKey);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_email_template", {
    p_event_key: eventKey,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row) {
    notFound();
  }

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Edit Email Template"
        description="Update subject and body content using supported variables."
      />
      <NotificationTemplateEditor
        eventKey={String(row.event_key)}
        displayName={String(row.display_name)}
        subjectTemplate={String(row.subject_template)}
        bodyHtmlTemplate={String(row.body_html_template)}
        bodyTextTemplate={
          row.body_text_template ? String(row.body_text_template) : null
        }
        allowedVariables={(row.allowed_variables as string[]) ?? []}
      />
    </HrSettingsWorkspace>
  );
}
