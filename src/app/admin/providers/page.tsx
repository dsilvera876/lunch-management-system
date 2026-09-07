import Link from "next/link";
import { requireHrAdminOrOwner, canManageCutoff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProvider } from "./actions";
import { CutoffControl } from "@/components/cutoff-control";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    "cutoff-updated"?: string;
  }>;
};

export default async function ProvidersPage({ searchParams }: Props) {
  const profile = await requireHrAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: providers, error }, { data: settings }] = await Promise.all([
    supabase
      .from("lunch_providers")
      .select("id, name, description, active, created_at")
      .order("name", { ascending: true }),
    supabase.from("app_settings").select("order_cutoff_time").eq("id", 1).single(),
  ]);

  if (error) {
    throw new Error("Unable to load lunch providers.");
  }

  return (
    <>
      <PageHeader
        title="Lunch Providers"
        description="Configure recurring Monday–Friday provider menus for employee ordering."
      />

      {params.created && (
        <Alert variant="success" className="mb-6">
          Provider created successfully.
        </Alert>
      )}

      {params.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          A provider with that name already exists.
        </Alert>
      )}

      {params.error && params.error !== "duplicate" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      {canManageCutoff(profile.role) && (
        <CutoffControl
          cutoffTime={settings?.order_cutoff_time ?? "16:00:00"}
          returnTo="/admin/providers"
          showUpdated={Boolean(params["cutoff-updated"])}
          showError={params.error === "cutoff-update" || params.error === "invalid-cutoff"}
        />
      )}

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionHeader title="Add provider" />
          <form action={createProvider} className="space-y-4">
            <FormField label="Name" htmlFor="name">
              <input id="name" name="name" required className={inputClassName} />
            </FormField>
            <FormField label="Description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                rows={3}
                className={textareaClassName}
              />
            </FormField>
            <Button type="submit" variant="primary">
              Create provider
            </Button>
          </form>
        </Card>

        <div className="xl:col-span-2">
          <SectionHeader title="Providers" />
          {!providers || providers.length === 0 ? (
            <EmptyState
              title="No providers yet"
              description="Create a lunch provider to configure recurring menus."
            />
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => (
                <Card key={provider.id} padding="sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{provider.name}</h3>
                        <StatusBadge status={provider.active ? "active" : "inactive"} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {provider.description ?? "No description"}
                      </p>
                    </div>
                    <Link
                      href={`/admin/providers/${provider.id}`}
                      className={linkButtonClass("secondary")}
                    >
                      Manage menu
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
