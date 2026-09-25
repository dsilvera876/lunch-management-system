import type { SupabaseClient } from "@supabase/supabase-js";

async function hasRowsForProvider(
  supabase: SupabaseClient,
  table: "provider_menu_items" | "lunch_days" | "provider_late_order_dispatches" | "provider_late_order_automatic_opportunities",
  providerId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("provider_id", providerId);

  if (error) {
    return true;
  }

  return (count ?? 0) > 0;
}

async function providerHasOrderHistory(
  supabase: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("orders")
    .select("id, lunch_days!inner(provider_id)", { count: "exact", head: true })
    .eq("lunch_days.provider_id", providerId);

  if (error) {
    return true;
  }

  return (count ?? 0) > 0;
}

/** Mirrors delete_unused_lunch_provider eligibility checks for UI treatment only. */
export async function isProviderEligibleForPermanentDeletion(
  supabase: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  if (await hasRowsForProvider(supabase, "provider_menu_items", providerId)) {
    return false;
  }
  if (await hasRowsForProvider(supabase, "lunch_days", providerId)) {
    return false;
  }
  if (await providerHasOrderHistory(supabase, providerId)) {
    return false;
  }
  if (await hasRowsForProvider(supabase, "provider_late_order_dispatches", providerId)) {
    return false;
  }
  if (
    await hasRowsForProvider(supabase, "provider_late_order_automatic_opportunities", providerId)
  ) {
    return false;
  }

  return true;
}
