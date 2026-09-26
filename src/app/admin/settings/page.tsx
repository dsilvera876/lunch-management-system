import type { ReactNode } from "react";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { canManageCutoff } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { OrderCutoffSettingsCard } from "@/components/admin/order-cutoff-settings-card";
import { SettingsOperationsCard } from "@/components/admin/settings-operations-card";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  searchParams: Promise<{
    error?: string;
    "cutoff-updated"?: string;
    cutoffDraft?: string;
  }>;
};

function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
  );
}

export default async function HrSettingsPage({ searchParams }: Props) {
  const profile = await requireHrAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("order_cutoff_time")
    .eq("id", 1)
    .single();

  const showCutoffError =
    params.error === "cutoff-update" || params.error === "invalid-cutoff";
  const errorKind =
    params.error === "invalid-cutoff"
      ? ("invalid-cutoff" as const)
      : params.error === "cutoff-update"
        ? ("cutoff-update" as const)
        : undefined;

  return (
    <HrSettingsWorkspace flashCutoffUpdated={Boolean(params["cutoff-updated"])}>
      <PageHeader
        title="Settings"
        description="Configure ordering and operational settings."
      />

      <div className="space-y-8">
        {canManageCutoff(profile.role) ? (
          <section>
            <SettingsSectionLabel>Ordering</SettingsSectionLabel>
            <OrderCutoffSettingsCard
              cutoffTime={settings?.order_cutoff_time ?? "16:00:00"}
              returnTo="/admin/settings"
              cutoffDraft={params.cutoffDraft}
              showError={showCutoffError}
              errorKind={errorKind}
            />
          </section>
        ) : null}

        <section>
          <SettingsSectionLabel>Operations</SettingsSectionLabel>
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsOperationsCard
              href="/admin/locations"
              title="Office Locations"
              description="Manage delivery locations and office addresses used when ordering."
              actionLabel="Manage locations"
              icon="map-pin"
            />
            <SettingsOperationsCard
              href="/admin/providers"
              title="Provider communications"
              description="Provider order-email settings are managed on each provider."
              actionLabel="Manage providers"
              icon="storefront"
            />
          </div>
        </section>
      </div>
    </HrSettingsWorkspace>
  );
}
