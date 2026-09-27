import { fetchSignupEmailDomains } from "@/app/admin/settings/auth-settings-actions";
import { AuthenticationDomainsSettings } from "@/components/admin/authentication-domains-settings";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";

export default async function AuthenticationSettingsPage() {
  await requireAdminOrOwner();
  const domains = await fetchSignupEmailDomains();

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Authentication"
        description="Manage trusted company email domains used during signup classification."
      />

      <AuthenticationDomainsSettings domains={domains} canManage />
    </HrSettingsWorkspace>
  );
}
