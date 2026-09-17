import Link from "next/link";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { canManageCutoff, canManageLegacyLunchDays } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { CutoffControl } from "@/components/cutoff-control";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { NavIcon } from "@/components/icons/line-icons";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    error?: string;
    "cutoff-updated"?: string;
  }>;
};

type SettingsLink = {
  href: string;
  title: string;
  description: string;
  icon: "map-pin" | "storefront" | "calendar";
};

const SETTINGS_LINKS: SettingsLink[] = [
  {
    href: "/admin/locations",
    title: "Office Locations",
    description: "Manage delivery locations and office addresses used when ordering.",
    icon: "map-pin",
  },
  {
    href: "/admin/providers",
    title: "Provider order emails",
    description: "Configure each provider’s primary order email on the provider detail page.",
    icon: "storefront",
  },
];

export default async function HrSettingsPage({ searchParams }: Props) {
  const profile = await requireHrAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("order_cutoff_time")
    .eq("id", 1)
    .single();

  const showLegacyLunchDays = canManageLegacyLunchDays(profile.role);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Lunch program configuration for office locations, ordering cutoff, and provider communications."
      />

      {canManageCutoff(profile.role) ? (
        <Card padding="md" className="mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Ordering cutoff time</h2>
          <p className="mt-1 text-sm text-muted">
            Daily deadline for staff lunch orders. Changes apply to the ordering workflow immediately.
          </p>
          <div className="mt-4">
            <CutoffControl
              cutoffTime={settings?.order_cutoff_time ?? "16:00:00"}
              returnTo="/admin/settings"
              showUpdated={Boolean(params["cutoff-updated"])}
              showError={params.error === "cutoff-update" || params.error === "invalid-cutoff"}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SETTINGS_LINKS.map((item) => (
          <Card key={item.href} padding="md" className="shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <NavIcon id={item.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-1 text-sm text-muted">{item.description}</p>
                <Link href={item.href} className={`${linkButtonClass("secondary")} mt-4`}>
                  Open
                </Link>
              </div>
            </div>
          </Card>
        ))}

        {showLegacyLunchDays ? (
          <Card padding="md" className="shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <NavIcon id="calendar" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">Legacy lunch days</h2>
                <p className="mt-1 text-sm text-muted">
                  Manual lunch days for legacy ordering flows without a recurring provider menu.
                </p>
                <Link href="/admin/lunch-days" className={`${linkButtonClass("secondary")} mt-4`}>
                  Open
                </Link>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
