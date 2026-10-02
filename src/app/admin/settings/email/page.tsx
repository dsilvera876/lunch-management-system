import { EmailSettingsWorkspace } from "@/components/admin/email-settings-workspace";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";
import { fetchAdminNotificationEvents } from "@/lib/notification-server";

export default async function EmailSettingsPage() {
  await requireAdminOrOwner();

  const [staffEvents, hrEvents, accountsEvents, providerEvents, adminEvents] =
    await Promise.all([
    fetchAdminNotificationEvents("staff"),
    fetchAdminNotificationEvents("hr"),
    fetchAdminNotificationEvents("accounts"),
    fetchAdminNotificationEvents("provider"),
    fetchAdminNotificationEvents("admin"),
  ]);

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Email Settings"
        description="Configure email notifications, templates, and delivery settings."
      />
      <EmailSettingsWorkspace
        staffEvents={staffEvents}
        hrEvents={hrEvents}
        accountsEvents={accountsEvents}
        providerEvents={providerEvents}
        adminEvents={adminEvents}
      />
    </HrSettingsWorkspace>
  );
}
