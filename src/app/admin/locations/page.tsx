import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OfficeLocationsWorkspace } from "@/components/admin/office-locations-workspace";
import { PageHeader } from "@/components/ui/page-header";
import type { OfficeLocationRecord } from "@/lib/office-locations-presentation";

export default async function OfficeLocationsPage() {
  await requireHrAdminOrOwner();
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
        description="Manage delivery locations used for staff lunch orders."
      />
      <OfficeLocationsWorkspace
        initialLocations={(locations ?? []) as OfficeLocationRecord[]}
      />
    </>
  );
}
