"use server";

import { revalidatePath } from "next/cache";
import { requirePermanentHrMenuItemRatingsAdmin } from "@/lib/auth";
import {
  parseHrCatalogMenuItemRatingsDetail,
  parseHrMenuItemRatingsAudit,
  parseHrMenuItemRatingsDashboard,
  type HrCatalogMenuItemRatingsDetail,
  type HrMenuItemRatingsAuditEntry,
  type HrMenuItemRatingsDashboard,
} from "@/lib/hr-menu-item-ratings";
import { createClient } from "@/lib/supabase/server";

function mapHrRatingsRpcError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("permanent hr")) {
    return "Permanent HR access is required.";
  }
  if (normalized.includes("support mode")) {
    return "Menu item ratings administration is unavailable in Support Mode.";
  }
  if (normalized.includes("reason is required")) {
    return "Enter a reason to continue.";
  }
  if (normalized.includes("authentication required")) {
    return "Sign in to continue.";
  }

  return "Unable to complete this action. Please try again.";
}

export async function loadHrProviderMenuItemRatingsDashboard(
  providerId: string,
): Promise<{ ok: true; dashboard: HrMenuItemRatingsDashboard } | { ok: false; message: string }> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_hr_provider_menu_item_ratings_dashboard", {
    p_provider_id: providerId,
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  const dashboard = parseHrMenuItemRatingsDashboard(data);
  if (!dashboard) {
    return { ok: false, message: "Unable to load ratings summary." };
  }

  return { ok: true, dashboard };
}

export async function loadHrCatalogMenuItemRatingsDetail(
  providerMenuItemId: string,
): Promise<
  { ok: true; detail: HrCatalogMenuItemRatingsDetail } | { ok: false; message: string }
> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_hr_catalog_menu_item_ratings_detail", {
    p_provider_menu_item_id: providerMenuItemId,
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  const detail = parseHrCatalogMenuItemRatingsDetail(data);
  if (!detail) {
    return { ok: false, message: "Unable to load menu item ratings." };
  }

  return { ok: true, detail };
}

export async function loadHrProviderMenuItemRatingsAudit(
  providerId: string,
  limit = 50,
): Promise<{ ok: true; entries: HrMenuItemRatingsAuditEntry[] } | { ok: false; message: string }> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_hr_provider_menu_item_ratings_audit", {
    p_provider_id: providerId,
    p_limit: limit,
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  return { ok: true, entries: parseHrMenuItemRatingsAudit(data) };
}

type MutationResult = { ok: true } | { ok: false; message: string };

function revalidateProviderRatingsPaths(providerId: string) {
  revalidatePath(`/admin/providers/${providerId}/ratings`);
  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath(`/admin/providers/${providerId}/edit`);
}

export async function hrRemoveMenuItemRatingAction(
  providerId: string,
  ratingId: string,
  reason: string,
): Promise<MutationResult> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("hr_remove_menu_item_rating", {
    p_rating_id: ratingId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  revalidateProviderRatingsPaths(providerId);
  return { ok: true };
}

export async function hrResetCatalogMenuItemRatingsAction(
  providerId: string,
  providerMenuItemId: string,
  reason: string,
): Promise<MutationResult> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("hr_reset_catalog_menu_item_ratings", {
    p_provider_menu_item_id: providerMenuItemId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  revalidateProviderRatingsPaths(providerId);
  return { ok: true };
}

export async function hrResetProviderMenuItemRatingsAction(
  providerId: string,
  reason: string,
): Promise<MutationResult> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("hr_reset_provider_menu_item_ratings", {
    p_provider_id: providerId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  revalidateProviderRatingsPaths(providerId);
  return { ok: true };
}

export async function hrSetProviderMenuItemRatingsEnabledAction(
  providerId: string,
  enabled: boolean,
  reason: string,
): Promise<MutationResult> {
  await requirePermanentHrMenuItemRatingsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("hr_set_provider_menu_item_ratings_enabled", {
    p_provider_id: providerId,
    p_enabled: enabled,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: mapHrRatingsRpcError(error.message) };
  }

  revalidateProviderRatingsPaths(providerId);
  revalidatePath("/lunch");
  revalidatePath("/my-orders");
  revalidatePath("/home");
  return { ok: true };
}
