import { notFound } from "next/navigation";

import { NotificationDeliveryDetailView } from "@/components/admin/notification-delivery-detail";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { requireAdminOrOwner } from "@/lib/auth";
import { loadNotificationDeliveryBatchDetail } from "@/lib/notification-delivery-server";

type Props = {
  params: Promise<{ batchId: string }>;
};

export default async function NotificationEmailDeliveryDetailPage({ params }: Props) {
  await requireAdminOrOwner();
  const { batchId } = await params;
  const detailResult = await loadNotificationDeliveryBatchDetail(batchId);

  if (!detailResult) {
    notFound();
  }

  return (
    <HrSettingsWorkspace>
      <NotificationDeliveryDetailView
        detail={detailResult.detail}
        recipients={detailResult.recipients}
        content={detailResult.content}
      />
    </HrSettingsWorkspace>
  );
}
