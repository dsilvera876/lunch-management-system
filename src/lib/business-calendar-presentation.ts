export type BusinessCalendarEntryType =
  | "public_holiday"
  | "company_closure"
  | "override_open"
  | "override_closed";

export type BusinessCalendarScope = "global" | "location";

export type BusinessCalendarSource = "official" | "manual";

export type BusinessCalendarEntryRow = {
  id: string;
  calendar_date: string;
  day_label: string;
  name: string;
  entry_type: BusinessCalendarEntryType;
  scope: BusinessCalendarScope;
  office_location_id: string | null;
  office_location_name: string | null;
  effective_open: boolean;
  source: BusinessCalendarSource;
  notes: string | null;
};

export const BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS: ReadonlyArray<{
  value: BusinessCalendarEntryType;
  label: string;
  description: string;
}> = [
  {
    value: "public_holiday",
    label: "Public Holiday",
    description: "Company-wide closure for a public holiday.",
  },
  {
    value: "company_closure",
    label: "Company Closure",
    description: "Company-wide closure for a non-holiday event.",
  },
  {
    value: "override_open",
    label: "Override — Open",
    description: "Override the normal calendar rules for this date.",
  },
  {
    value: "override_closed",
    label: "Override — Closed",
    description: "Force this date closed regardless of weekday rules.",
  },
];

export function businessCalendarEntryTypeLabel(
  entryType: BusinessCalendarEntryType,
): string {
  return (
    BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS.find((option) => option.value === entryType)
      ?.label ?? entryType
  );
}

export function businessCalendarScopeLabel(
  scope: BusinessCalendarScope,
  locationName: string | null,
): string {
  if (scope === "location" && locationName) {
    return locationName;
  }

  return "Company-wide";
}

export function businessCalendarSourceLabel(source: BusinessCalendarSource): string {
  return source === "official" ? "Official" : "HR";
}

export function formatBusinessCalendarDisplayDate(calendarDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${calendarDate}T12:00:00-05:00`));
}
