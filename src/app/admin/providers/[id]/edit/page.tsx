import { notFound } from "next/navigation";
import { requireManageProviders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProvider } from "../../actions";
import { ProviderDetailsFields } from "@/components/admin/lunch-providers/provider-details-fields";
import { ProviderOrderEmailField } from "@/components/admin/lunch-providers/provider-order-email-field";
import { ACTIVATE_PROVIDER_EMAIL_REQUIRED_MESSAGE } from "@/lib/provider-order-email";
import { ProviderDangerZone } from "@/components/admin/lunch-providers/provider-danger-zone";
import { ProviderEditWorkspace } from "@/components/admin/lunch-providers/provider-edit-workspace";
import { PROVIDER_IN_USE_DELETION_MESSAGE } from "@/lib/unused-record-deletion";
import { isProviderEligibleForPermanentDeletion } from "@/lib/provider-permanent-deletion";
import { ProviderLateOrderSettings } from "@/components/admin/provider-late-order-settings";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { ProviderIconWell } from "@/lib/provider-icons";
import type { ProviderEditFlashSuccess } from "@/lib/provider-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
    statusUpdated?: string;
    lateUpdated?: string;
  }>;
};

function resolveFlashSuccess(query: {
  updated?: string;
  statusUpdated?: string;
  lateUpdated?: string;
}): ProviderEditFlashSuccess | undefined {
  if (query.updated) {
    return "updated";
  }
  if (query.statusUpdated) {
    return "statusUpdated";
  }
  if (query.lateUpdated) {
    return "lateUpdated";
  }
  return undefined;
}

export default async function ProviderEditPage({ params, searchParams }: Props) {
  await requireManageProviders();

  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: provider, error } = await supabase
    .from("lunch_providers")
    .select(
      "id, name, description, icon_key, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, automatic_supplement_send_day, automatic_supplement_send_time, primary_order_email",
    )
    .eq("id", id)
    .single();

  if (error || !provider) {
    notFound();
  }

  const canDeletePermanently = await isProviderEligibleForPermanentDeletion(supabase, provider.id);
  const flashSuccess = resolveFlashSuccess(query);

  const providerDetailsError =
    query.error === "duplicate" ||
    query.error === "update" ||
    query.error === "provider-email" ||
    query.error === "provider-email-required"
      ? query.error
      : undefined;
  const lateOrderError =
    query.error === "late-settings" ||
    query.error === "late-schedule" ||
    query.error === "late-update"
      ? query.error
      : undefined;
  const dangerZoneError =
    query.error === "in-use" ||
    query.error === "unauthorized" ||
    query.error === "delete" ||
    query.error === "status" ||
    query.error === "activate-email-required"
      ? query.error
      : undefined;

  const missingOrderEmail =
    provider.active &&
    (!provider.primary_order_email || provider.primary_order_email.trim().length === 0);

  return (
    <ProviderEditWorkspace flashSuccess={flashSuccess}>
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center gap-3">
          <ProviderIconWell iconKey={provider.icon_key} size="large" alt={provider.name} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">Edit provider</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-foreground">{provider.name}</h1>
              <StatusBadge status={provider.active ? "active" : "inactive"} />
            </div>
          </div>
        </header>

        <div className="grid gap-8">
          {missingOrderEmail && (
            <Alert variant="warning">
              This provider is active but has no provider order email. Add one below before daily
              or supplemental kitchen emails can be sent.
            </Alert>
          )}

          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <section>
              <SectionHeader title="Provider details" />
              <Card>
                {providerDetailsError === "duplicate" && (
                  <Alert variant="error" className="mb-4">
                    A provider with that name already exists.
                  </Alert>
                )}
                {providerDetailsError === "update" && (
                  <Alert variant="error" className="mb-4">
                    Unable to save provider settings.
                  </Alert>
                )}
                {providerDetailsError === "provider-email" && (
                  <Alert variant="error" className="mb-4">
                    Enter a valid provider order email address.
                  </Alert>
                )}
                {providerDetailsError === "provider-email-required" && (
                  <Alert variant="error" className="mb-4">
                    Active providers require a provider order email.
                  </Alert>
                )}

                <form action={updateProvider} className="grid gap-4">
                  <input type="hidden" name="id" value={provider.id} />
                  <input type="hidden" name="active" value={provider.active ? "true" : "false"} />

                  <ProviderDetailsFields
                    idPrefix="edit-provider"
                    layout="edit"
                    defaultName={provider.name}
                    defaultDescription={provider.description ?? ""}
                    defaultIconKey={provider.icon_key}
                  />

                  <ProviderOrderEmailField
                    idPrefix="edit-provider"
                    defaultValue={provider.primary_order_email}
                    required={provider.active}
                  />

                  <div className="flex justify-end border-t border-border pt-4">
                    <button type="submit" className={linkButtonClass("primary")}>
                      Save settings
                    </button>
                  </div>
                </form>
              </Card>
            </section>

            <section>
              <SectionHeader title="Late orders" />
              <Card>
                {lateOrderError === "late-settings" && (
                  <Alert variant="error" className="mb-4">
                    Choose a late-order deadline day and time.
                  </Alert>
                )}
                {lateOrderError === "late-schedule" && (
                  <Alert variant="error" className="mb-4">
                    Automatic supplemental send time must be after the late-order deadline.
                  </Alert>
                )}
                {lateOrderError === "late-update" && (
                  <Alert variant="error" className="mb-4">
                    Unable to save late-order settings.
                  </Alert>
                )}

                <ProviderLateOrderSettings
                  providerId={provider.id}
                  settings={{
                    acceptsLateOrders: provider.accepts_late_orders,
                    lateOrderDeadlineDay: provider.late_order_deadline_day,
                    lateOrderDeadlineTime: provider.late_order_deadline_time,
                    supplementalDispatchMode: provider.supplemental_dispatch_mode,
                    automaticSupplementSendDay: provider.automatic_supplement_send_day,
                    automaticSupplementSendTime: provider.automatic_supplement_send_time,
                  }}
                />
              </Card>
            </section>
          </div>

          {dangerZoneError === "in-use" && (
            <Alert variant="error">{PROVIDER_IN_USE_DELETION_MESSAGE}</Alert>
          )}
          {dangerZoneError === "unauthorized" && (
            <Alert variant="error">You are not authorized to delete lunch providers.</Alert>
          )}
          {dangerZoneError === "delete" && (
            <Alert variant="error">Unable to delete this provider.</Alert>
          )}
          {dangerZoneError === "status" && (
            <Alert variant="error">Unable to update provider status.</Alert>
          )}
          {dangerZoneError === "activate-email-required" && (
            <Alert variant="error">{ACTIVATE_PROVIDER_EMAIL_REQUIRED_MESSAGE}</Alert>
          )}

          <ProviderDangerZone
            providerId={provider.id}
            active={provider.active}
            canDeletePermanently={canDeletePermanently}
          />
        </div>
      </div>
    </ProviderEditWorkspace>
  );
}
