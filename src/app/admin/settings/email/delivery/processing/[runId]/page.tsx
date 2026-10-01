import { NotificationProcessingDetailView } from "@/components/admin/notification-processing-detail";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { requireAdminOrOwner } from "@/lib/auth";
import { loadNotificationProcessingRunDetail } from "@/lib/notification-delivery-server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ runId: string }>;
};

export default async function NotificationProcessingDetailPage({ params }: Props) {
  await requireAdminOrOwner();
  const { runId } = await params;
  const run = await loadNotificationProcessingRunDetail(runId);

  if (!run) {
    notFound();
  }

  return (
    <HrSettingsWorkspace>
      <NotificationProcessingDetailView run={run} />
    </HrSettingsWorkspace>
  );
}
