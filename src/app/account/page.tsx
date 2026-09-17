import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getRoleLabel } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField, selectClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";
import { UPDATE_PASSWORD_PATH } from "@/lib/auth-recovery";
import { formatOfficeLocationLabel } from "@/lib/office-locations";
import { updateDefaultOfficeLocation } from "./actions";

type Props = {
  searchParams: Promise<{
    message?: string;
    locationUpdated?: string;
    locationError?: string;
  }>;
};

export default async function AccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: activeLocations }, { data: profileRow }] = await Promise.all([
    supabase
      .from("office_locations")
      .select("id, name, address, description, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select(`
        default_office_location_id,
        office_locations:default_office_location_id (
          id,
          name,
          address,
          is_active
        )
      `)
      .eq("id", profile.id)
      .single(),
  ]);

  const defaultLocation = profileRow?.office_locations
    ? Array.isArray(profileRow.office_locations)
      ? profileRow.office_locations[0]
      : profileRow.office_locations
    : null;

  const defaultIsInactive = Boolean(
    defaultLocation && defaultLocation.is_active === false,
  );

  return (
    <>
      <PageHeader
        title="Preferences"
        description="Your profile and delivery settings for the lunch management system."
      />

      {params.message === "password-updated" && (
        <Alert variant="success" className="mb-6">
          Your password has been updated.
        </Alert>
      )}

      {params.locationUpdated && (
        <Alert variant="success" className="mb-6">
          Default delivery location updated.
        </Alert>
      )}

      {params.locationError && (
        <Alert variant="error" className="mb-6">
          Unable to update your default delivery location.
        </Alert>
      )}

      <Card className="mb-6 max-w-xl">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted">Name</dt>
            <dd className="mt-1 font-medium">{profile.full_name ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Role</dt>
            <dd className="mt-1 font-medium">{getRoleLabel(profile.role)}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-4">
          <Link href={UPDATE_PASSWORD_PATH} className={linkButtonClass("secondary")}>
            Change password
          </Link>
        </div>
      </Card>

      <Card className="max-w-xl">
        <SectionHeader
          title="Default office location"
          description="New orders use this delivery location automatically. You can still change location for an individual order."
        />

        {defaultIsInactive && defaultLocation && (
          <Alert variant="error" className="mb-4">
            Your saved default ({defaultLocation.name}) is inactive. Choose a new
            active default below.
          </Alert>
        )}

        {!defaultLocation && (
          <p className="mb-4 text-sm text-muted">
            No default delivery location saved yet. Choose one before ordering, or
            save a default here.
          </p>
        )}

        {defaultLocation && !defaultIsInactive && (
          <p className="mb-4 text-sm">
            Current default:{" "}
            <span className="font-medium">
              {formatOfficeLocationLabel(
                defaultLocation.name,
                defaultLocation.address,
              )}
            </span>
          </p>
        )}

        {(activeLocations ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            No active office locations are available yet.
          </p>
        ) : (
          <form action={updateDefaultOfficeLocation} className="space-y-4">
            <FormField label="Active location" htmlFor="officeLocationId">
              <select
                id="officeLocationId"
                name="officeLocationId"
                required
                defaultValue={
                  defaultIsInactive
                    ? ""
                    : profileRow?.default_office_location_id ?? ""
                }
                className={selectClassName}
              >
                <option value="" disabled>
                  Select a location
                </option>
                {(activeLocations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatOfficeLocationLabel(location.name, location.address)}
                  </option>
                ))}
              </select>
            </FormField>
            <Button type="submit" variant="primary">
              Save default location
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
