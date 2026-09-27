import { fetchEmailDeliverySettings } from "@/app/admin/settings/auth-settings-actions";
import { EmailDeliverySettingsForm } from "@/components/admin/email-delivery-settings-form";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";

export default async function EmailDeliverySettingsPage() {
  await requireAdminOrOwner();
  const settings = await fetchEmailDeliverySettings();

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Email delivery"
        description="Configure SMTP delivery for authentication and application email."
      />

      {settings ? (
        <EmailDeliverySettingsForm settings={settings} />
      ) : (
        <p className="text-sm text-muted">Email delivery settings are not available.</p>
      )}
    </HrSettingsWorkspace>
  );
}
