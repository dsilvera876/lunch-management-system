import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toggleOfficeLocationActive, updateOfficeLocation } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    updated?: string;
    statusUpdated?: string;
    error?: string;
  }>;
};

export default async function OfficeLocationDetailPage({
  params,
  searchParams,
}: Props) {
  await requireHrAdminOrOwner();

  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: location, error } = await supabase
    .from("office_locations")
    .select("id, name, description, address, is_active")
    .eq("id", id)
    .single();

  if (error || !location) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={location.name}
        description="Update delivery location details used for new orders."
        actions={
          <Link href="/admin/locations" className={linkButtonClass("ghost")}>
            All locations
          </Link>
        }
      />

      {query.updated && (
        <Alert variant="success" className="mb-6">
          Location updated successfully.
        </Alert>
      )}

      {query.statusUpdated && (
        <Alert variant="success" className="mb-6">
          Location status updated.
        </Alert>
      )}

      {query.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          An office location with that name already exists.
        </Alert>
      )}

      {query.error && query.error !== "duplicate" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      <Card className="max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <StatusBadge status={location.is_active ? "active" : "inactive"} />
          {!location.is_active && (
            <p className="text-sm text-muted">
              Inactive locations cannot be used for new orders. Historical orders
              keep their snapshot.
            </p>
          )}
        </div>

        <form action={updateOfficeLocation} className="space-y-4">
          <input type="hidden" name="id" value={location.id} />
          <FormField label="Name" htmlFor="name">
            <input
              id="name"
              name="name"
              required
              defaultValue={location.name}
              className={inputClassName}
            />
          </FormField>
          <FormField label="Address" htmlFor="address">
            <input
              id="address"
              name="address"
              defaultValue={location.address ?? ""}
              className={inputClassName}
            />
          </FormField>
          <FormField label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={location.description ?? ""}
              className={textareaClassName}
            />
          </FormField>
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </form>

        <form action={toggleOfficeLocationActive} className="mt-8 border-t border-border pt-6">
          <input type="hidden" name="id" value={location.id} />
          <input
            type="hidden"
            name="active"
            value={location.is_active ? "true" : "false"}
          />
          <Button type="submit" variant="secondary">
            {location.is_active ? "Deactivate location" : "Activate location"}
          </Button>
        </form>
      </Card>
    </>
  );
}
