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

/** Stable marker for UI tests and accessibility hooks. */
export const BUSINESS_CALENDAR_INFO_CALLOUT_ID = "business-calendar-info-callout";

export const BUSINESS_CALENDAR_IMPACT_WARNING_ID = "business-calendar-impact-warning";

export const BUSINESS_CALENDAR_DRAWER_ACTIONS = {
  cancel: "Cancel",
  save: "Save Entry",
  goBack: "Go back",
  confirmSave: "Confirm and save",
} as const;

const TABLE_ACTION_BASE =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function businessCalendarTableActionClassName(
  variant: "view" | "edit" | "archive",
): string {
  switch (variant) {
    case "view":
      return `${TABLE_ACTION_BASE} border-border bg-surface text-foreground hover:bg-muted/40`;
    case "edit":
      return `${TABLE_ACTION_BASE} border-border bg-surface text-foreground hover:bg-muted/40`;
    case "archive":
      return `${TABLE_ACTION_BASE} border-red-200 bg-surface text-red-700 hover:bg-red-50 focus-visible:outline-red-600`;
  }
}

export const BUSINESS_CALENDAR_IMPACT_BODY =
  "New ordering will close for this date. Existing orders will remain unchanged.";

export function hasBusinessCalendarImpactWarning(
  lunchDayCount: number,
  submittedOrderCount: number,
): boolean {
  return lunchDayCount > 0 || submittedOrderCount > 0;
}

export function formatBusinessCalendarImpactHeadline(
  lunchDayCount: number,
  submittedOrderCount: number,
): string | null {
  const parts: string[] = [];

  if (lunchDayCount > 0) {
    parts.push(
      `${lunchDayCount} lunch schedule${lunchDayCount === 1 ? "" : "s"}`,
    );
  }

  if (submittedOrderCount > 0) {
    parts.push(
      `${submittedOrderCount} submitted order${submittedOrderCount === 1 ? "" : "s"}`,
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return `${parts.join(" and ")} will be affected.`;
}
