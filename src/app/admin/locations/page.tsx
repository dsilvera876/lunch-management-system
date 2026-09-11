import Link from "next/link";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createOfficeLocation } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";
import { formatOfficeLocationLabel } from "@/lib/office-locations";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    deleted?: string;
  }>;
};

export default async function OfficeLocationsPage({ searchParams }: Props) {
  await requireHrAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: locations, error } = await supabase
    .from("office_locations")
    .select("id, name, description, address, is_active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Unable to load office locations.");
  }

  return (
    <>
      <PageHeader
        title="Office Locations"
        description="Manage delivery locations used when staff place lunch orders."
      />

      {params.created && (
        <Alert variant="success" className="mb-6">
          Office location created successfully.
        </Alert>
      )}

      {params.deleted && (
        <Alert variant="success" className="mb-6">
          Office location deleted permanently.
        </Alert>
      )}

      {params.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          An office location with that name already exists.
        </Alert>
      )}

      {params.error && params.error !== "duplicate" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionHeader title="Add location" />
          <form action={createOfficeLocation} className="space-y-4">
            <FormField label="Name" htmlFor="name">
              <input id="name" name="name" required className={inputClassName} />
            </FormField>
            <FormField label="Address" htmlFor="address">
              <input id="address" name="address" className={inputClassName} />
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
              Create location
            </Button>
          </form>
        </Card>

        <div className="xl:col-span-2">
          <SectionHeader title="Locations" />
          {(locations ?? []).length === 0 ? (
            <EmptyState
              title="No office locations yet"
              description="Create a delivery location for staff lunch orders."
            />
          ) : (
            <div className="space-y-3">
              {(locations ?? []).map((location) => (
                <Card
                  key={location.id}
                  padding="sm"
                  className={
                    location.is_active
                      ? "ring-1 ring-emerald-100"
                      : "opacity-80 ring-1 ring-slate-200"
                  }
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{location.name}</h3>
                        <StatusBadge
                          status={location.is_active ? "active" : "inactive"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {formatOfficeLocationLabel(location.name, location.address)}
                      </p>
                      {location.description && (
                        <p className="mt-2 text-sm text-muted">
                          {location.description}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/admin/locations/${location.id}`}
                      className={`${linkButtonClass("primary")} shrink-0`}
                    >
                      Manage location
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
