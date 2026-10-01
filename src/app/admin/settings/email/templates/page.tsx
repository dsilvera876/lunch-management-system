import Link from "next/link";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { linkButtonClass } from "@/components/ui/button";
import { requireAdminOrOwner } from "@/lib/auth";
import { EMAIL_SETTINGS_PATH, notificationTemplateEditPath } from "@/lib/notification-presentation";
import { createClient } from "@/lib/supabase/server";

export default async function EmailTemplatesPage() {
  await requireAdminOrOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_notification_email_templates");

  if (error) {
    throw new Error(error.message);
  }

  const templates = (data ?? []) as Array<{
    event_key: string;
    display_name: string;
    audience: string;
    active: boolean;
    updated_at: string;
  }>;

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Email Templates"
        description="Edit notification templates and preview sample content."
      />
      <div className="mb-4">
        <Link href={EMAIL_SETTINGS_PATH} className={linkButtonClass("ghost")}>
          ← Back to Email Settings
        </Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Template</th>
              <th className="px-3 py-2 font-semibold">Audience</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Last updated</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.event_key} className="border-b border-border/70 last:border-0">
                <td className="px-3 py-3 font-medium">{template.display_name}</td>
                <td className="px-3 py-3 capitalize">{template.audience}</td>
                <td className="px-3 py-3">{template.active ? "Active" : "Inactive"}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {new Date(template.updated_at).toLocaleString("en-US", {
                    timeZone: "America/Jamaica",
                  })}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={notificationTemplateEditPath(template.event_key)}
                    className={linkButtonClass("ghost")}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {templates.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No templates configured yet.</p>
      ) : null}
    </HrSettingsWorkspace>
  );
}
