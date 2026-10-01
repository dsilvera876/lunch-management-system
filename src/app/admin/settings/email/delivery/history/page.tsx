import { NotificationDeliveryHistory } from "@/components/admin/notification-delivery-history";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";
import { notificationDeliveryDateRangePresetDays } from "@/lib/notification-delivery";
import { loadNotificationDeliveryHistory } from "@/lib/notification-delivery-server";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    event?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function NotificationEmailDeliveryHistoryPage({ searchParams }: Props) {
  await requireAdminOrOwner();
  const params = await searchParams;
  const preset = notificationDeliveryDateRangePresetDays(30);
  const from = params.from ?? preset.from;
  const to = params.to ?? preset.to;
  const eventKey = params.event ?? "";
  const status = params.status ?? "";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const pageSize = 25;

  const { rows, hasMore } = await loadNotificationDeliveryHistory({
    from,
    to,
    eventKey: eventKey || null,
    status: status || null,
    page,
    pageSize,
  });

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Delivery History"
        description="View notification delivery batches, statuses, and troubleshooting details."
      />
      <NotificationDeliveryHistory
        rows={rows}
        from={from}
        to={to}
        eventKey={eventKey}
        status={status}
        page={page}
        hasMore={hasMore}
      />
    </HrSettingsWorkspace>
  );
}
