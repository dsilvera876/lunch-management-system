import type { SupabaseClient } from "@supabase/supabase-js";

export type LunchPeriod = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  status: "open" | "finalized";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Future Batch 2B financial summary row shape.
 * UI and Excel export will consume the same server-side summary data.
 *
 * Accounting rule: lunch-period membership uses ORDER DATE, not delivery date.
 * An order belongs to a period when start_date <= order_date <= end_date.
 */
export type LunchPeriodSummaryLine = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  lunchPeriodId: string;
  lunchPeriodLabel: string;
  orderDate: string;
  deliveryDate: string;
  providerName: string;
  orderTotal: number;
  periodTotal: number;
};

export function formatLunchPeriodDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatLunchPeriodRange(
  startDate: string,
  endDate: string,
): string {
  return `${formatLunchPeriodDate(startDate)} – ${formatLunchPeriodDate(endDate)}`;
}

export function formatLunchPeriodDisplay(
  period: Pick<LunchPeriod, "label" | "start_date" | "end_date">,
): string {
  return `${period.label} (${formatLunchPeriodRange(period.start_date, period.end_date)})`;
}

/**
 * Lunch-period membership is based on order date, not delivery date.
 */
export function orderDateBelongsToPeriod(
  orderDate: string,
  period: Pick<LunchPeriod, "start_date" | "end_date">,
): boolean {
  return orderDate >= period.start_date && orderDate <= period.end_date;
}

export function getLatestLunchPeriod(
  periods: LunchPeriod[],
): LunchPeriod | null {
  if (periods.length === 0) {
    return null;
  }

  return periods.reduce((latest, period) =>
    period.end_date > latest.end_date ? period : latest,
  );
}

export function getNextPeriodStartDate(latestEndDate: string): string {
  const [year, month, day] = latestEndDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

export function isLatestLunchPeriod(
  period: LunchPeriod,
  periods: LunchPeriod[],
): boolean {
  const latest = getLatestLunchPeriod(periods);
  return latest?.id === period.id;
}

export async function getCurrentLunchPeriod(
  supabase: SupabaseClient,
): Promise<LunchPeriod | null> {
  const { data, error } = await supabase
    .from("lunch_periods")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load current lunch period.");
  }

  return data as LunchPeriod | null;
}

export async function listLunchPeriods(
  supabase: SupabaseClient,
): Promise<LunchPeriod[]> {
  const { data, error } = await supabase
    .from("lunch_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    throw new Error("Unable to load lunch periods.");
  }

  return (data ?? []) as LunchPeriod[];
}

export function validateFirstLunchPeriodInput(input: {
  label: string;
  startDate: string;
  endDate: string;
}): string | null {
  if (!input.label.trim()) {
    return "Label is required.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    return "Start date is invalid.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return "End date is invalid.";
  }

  if (input.startDate > input.endDate) {
    return "Start date must be on or before end date.";
  }

  return null;
}

export function validateNextLunchPeriodInput(input: {
  label: string;
  endDate: string;
  derivedStartDate: string;
}): string | null {
  if (!input.label.trim()) {
    return "Label is required.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return "End date is invalid.";
  }

  if (input.endDate < input.derivedStartDate) {
    return "End date must be on or after the derived start date.";
  }

  return null;
}

/** @deprecated Use validateFirstLunchPeriodInput or validateNextLunchPeriodInput */
export function validateLunchPeriodInput(input: {
  label: string;
  startDate: string;
  endDate: string;
}): string | null {
  return validateFirstLunchPeriodInput(input);
}
