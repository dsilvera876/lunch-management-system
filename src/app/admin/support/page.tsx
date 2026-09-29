import { requireAdminOrOwner } from "@/lib/auth";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { SupportModeWorkspace } from "@/components/admin/support-mode-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminSupportPage() {
  await requireAdminOrOwner();
  const activeSession = await fetchActiveSupportSession();

  return (
    <>
      <PageHeader
        title="Support Mode"
        description="Temporary read-only access to HR or Accounts operational areas for IT troubleshooting."
      />
      <SupportModeWorkspace activeSession={activeSession} />
    </>
  );
}
