import type { ReactNode } from "react";

import { requireAdminOrOwner } from "@/lib/auth";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { SettingsOperationsCard } from "@/components/admin/settings-operations-card";
import { PageHeader } from "@/components/ui/page-header";

function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
  );
}

export default async function AdminSystemSettingsPage() {
  await requireAdminOrOwner();

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Admin Settings"
        description="Technical configuration for authentication, email delivery, and system behavior."
      />

      <section>
        <SettingsSectionLabel>Authentication &amp; email</SettingsSectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsOperationsCard
            href="/admin/settings/authentication"
            title="Authentication"
            description="Trusted company email domains for signup classification."
            actionLabel="Manage domains"
            icon="settings"
          />
          <SettingsOperationsCard
            href="/admin/settings/email-delivery"
            title="Email delivery"
            description="SMTP settings for authentication and application email."
            actionLabel="Configure email"
            icon="settings"
          />
        </div>
      </section>
    </HrSettingsWorkspace>
  );
}
