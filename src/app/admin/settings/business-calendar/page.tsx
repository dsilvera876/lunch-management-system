import { requireHrOperationalRead } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HrSettingsWorkspace } from "@/components/admin/hr-settings-workspace";
import { BusinessCalendarWorkspace } from "@/components/admin/business-calendar-workspace";
import { PageHeader } from "@/components/ui/page-header";
import type { BusinessCalendarEntryRow } from "@/lib/business-calendar-presentation";
import type { OfficeLocationRecord } from "@/lib/office-locations-presentation";
import { getJamaicaTodayDate } from "@/lib/datetime";

type Props = {
  searchParams: Promise<{ year?: string }>;
};

function parseYear(raw: string | undefined): number {
  const todayYear = Number(getJamaicaTodayDate().slice(0, 4));
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
    return todayYear;
  }

  return parsed;
}

export default async function BusinessCalendarPage({ searchParams }: Props) {
  await requireHrOperationalRead();
  const params = await searchParams;
  const year = parseYear(params.year);
  const supabase = await createClient();

  const [{ data: entries, error: entriesError }, { data: locations, error: locationsError }] =
    await Promise.all([
      supabase.rpc("list_business_calendar_entries", {
        p_year: year,
        p_search: null,
        p_entry_type: null,
      }),
      supabase
        .from("office_locations")
        .select("id, name, description, address, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (entriesError) {
    throw new Error(entriesError.message);
  }

  if (locationsError) {
    throw new Error("Unable to load office locations.");
  }

  return (
    <HrSettingsWorkspace>
      <PageHeader
        title="Business Calendar"
        description="Manage public holidays, company closures, and exceptional business days used by lunch ordering."
      />
      <BusinessCalendarWorkspace
        year={year}
        initialEntries={(entries ?? []) as BusinessCalendarEntryRow[]}
        locations={(locations ?? []) as OfficeLocationRecord[]}
      />
    </HrSettingsWorkspace>
  );
}
