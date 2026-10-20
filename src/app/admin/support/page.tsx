import { requireAdminOrOwner } from "@/lib/auth";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { SupportModeWorkspace } from "@/components/admin/support-mode-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { pageMetadata } from "@/lib/page-titles";
import {
  SUPPORT_SESSION_STALE_MESSAGE,
  SUPPORT_SESSION_STALE_NOTICE,
} from "@/lib/support-mode";

export const metadata = pageMetadata("adminSupport");

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireAdminOrOwner();
  const [activeSession, params] = await Promise.all([
    fetchActiveSupportSession(),
    searchParams,
  ]);
  const notice =
    params.notice === SUPPORT_SESSION_STALE_NOTICE
      ? SUPPORT_SESSION_STALE_MESSAGE
      : null;

  return (
    <>
      <PageHeader
        title="Support Mode"
        description="Temporary read-only access to HR or Accounts operational areas for IT troubleshooting."
      />
      <SupportModeWorkspace activeSession={activeSession} notice={notice} />
    </>
  );
}
