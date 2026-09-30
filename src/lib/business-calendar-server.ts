import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate } from "@/lib/datetime";

export type BusinessCalendarEntryImpact = {
  requires_confirmation: boolean;
  lunch_day_count: number;
  submitted_order_count: number;
  summary: string | null;
};

export async function fetchIsBusinessDay(
  calendarDate: string,
  officeLocationId: string | null = null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_business_day", {
    p_date: calendarDate,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}

export async function fetchDeliveryDateForOrderDate(
  orderDate: string,
  officeLocationId: string | null = null,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delivery_date_for_order_date", {
    p_order_date: orderDate,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function fetchOrderDateForDeliveryDate(
  deliveryDate: string,
  officeLocationId: string | null = null,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_date_for_delivery_date", {
    p_delivery_date: deliveryDate,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function fetchDefaultOperationalDeliveryDate(
  today = getJamaicaTodayDate(),
): Promise<string> {
  if (await fetchIsBusinessDay(today, null)) {
    return today;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_business_day", {
    p_date: today,
    p_office_location_id: null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? today;
}

export async function fetchCandidateLateOrderDeliveryDates(
  today: string,
): Promise<string[]> {
  const dates = new Set<string>([today]);
  const nextDelivery = await fetchDeliveryDateForOrderDate(today, null);

  if (nextDelivery) {
    dates.add(nextDelivery);
  }

  return [...dates].sort();
}

export async function previewBusinessCalendarEntryImpact(input: {
  id: string | null;
  calendarDate: string;
  entryType: string;
  scope: string;
  officeLocationId: string | null;
}): Promise<BusinessCalendarEntryImpact> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_business_calendar_entry_impact", {
    p_id: input.id,
    p_calendar_date: input.calendarDate,
    p_entry_type: input.entryType,
    p_scope: input.scope,
    p_office_location_id: input.officeLocationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data as Record<string, unknown>;

  return {
    requires_confirmation: Boolean(row.requires_confirmation),
    lunch_day_count: Number(row.lunch_day_count ?? 0),
    submitted_order_count: Number(row.submitted_order_count ?? 0),
    summary: typeof row.summary === "string" ? row.summary : null,
  };
}
