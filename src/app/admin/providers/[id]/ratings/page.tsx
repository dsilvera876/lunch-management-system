import { notFound } from "next/navigation";
import { requirePermanentHrMenuItemRatingsAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HrProviderMenuItemRatingsWorkspace } from "@/components/admin/lunch-providers/hr-provider-menu-item-ratings-workspace";
import {
  formatHrMenuItemRatingsAuditTimestamp,
  parseHrMenuItemRatingsAudit,
  parseHrMenuItemRatingsDashboard,
} from "@/lib/hr-menu-item-ratings";
import { Alert } from "@/components/ui/alert";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProviderMenuItemRatingsPage({ params }: Props) {
  await requirePermanentHrMenuItemRatingsAdmin();

  const { id } = await params;
  const supabase = await createClient();

  const { data: provider, error: providerError } = await supabase
    .from("lunch_providers")
    .select("id, icon_key")
    .eq("id", id)
    .maybeSingle();

  if (providerError || !provider) {
    notFound();
  }

  const { data: dashboardPayload, error: dashboardError } = await supabase.rpc(
    "get_hr_provider_menu_item_ratings_dashboard",
    { p_provider_id: id },
  );

  if (dashboardError) {
    throw new Error("Unable to load provider ratings.");
  }

  const dashboard = parseHrMenuItemRatingsDashboard(dashboardPayload);
  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Alert variant="error">Unable to load provider ratings summary.</Alert>
      </div>
    );
  }

  const { data: auditPayload, error: auditError } = await supabase.rpc(
    "get_hr_provider_menu_item_ratings_audit",
    { p_provider_id: id, p_limit: 50 },
  );

  if (auditError) {
    throw new Error("Unable to load ratings audit log.");
  }

  const auditEntries = parseHrMenuItemRatingsAudit(auditPayload).map((entry) => ({
    ...entry,
    createdAtLabel: formatHrMenuItemRatingsAuditTimestamp(entry.createdAt),
  }));

  return (
    <HrProviderMenuItemRatingsWorkspace
      dashboard={dashboard}
      auditEntries={auditEntries}
      providerIconKey={provider.icon_key}
    />
  );
}
