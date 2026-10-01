import { NotificationDeliveryDashboard } from "@/components/admin/notification-delivery-dashboard";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminOrOwner } from "@/lib/auth";
import { notificationDeliveryDateRangePresetDays } from "@/lib/notification-delivery";
import { loadNotificationDeliveryDashboard } from "@/lib/notification-delivery-server";

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function NotificationEmailDeliveryPage({ searchParams }: Props) {
  await requireAdminOrOwner();
  const params = await searchParams;
  const preset = notificationDeliveryDateRangePresetDays(30);
  const from = params.from ?? preset.from;
  const to = params.to ?? preset.to;
  const { summary, recent } = await loadNotificationDeliveryDashboard(from, to);

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Email Delivery"
        description="Monitor notification email activity and troubleshoot delivery issues."
      />
      <NotificationDeliveryDashboard summary={summary} recent={recent} from={from} to={to} />
    </HrSettingsWorkspace>
  );
}
