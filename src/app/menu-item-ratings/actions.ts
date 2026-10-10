"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import {
  indexRatingSummaries,
  MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE,
  parseMenuItemRatingSummaries,
  type LoadMenuItemRatingSummariesResult,
  type MenuItemRatingSummary,
} from "@/lib/menu-item-ratings";
import { createClient } from "@/lib/supabase/server";

function mapRatingRpcError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("authentication required")) {
    return "Sign in to rate menu items.";
  }
  if (normalized.includes("not available")) {
    return "Ratings are not available for this provider.";
  }
  if (normalized.includes("verified delivery")) {
    return "A verified delivery is required before you can rate this item.";
  }
  if (normalized.includes("another qualifying delivery")) {
    return "Order this item again after delivery to change your rating.";
  }
  if (normalized.includes("removed and cannot")) {
    return "This rating was removed and cannot be changed for this period.";
  }
  if (normalized.includes("support mode is read-only")) {
    return "Support Mode is read-only.";
  }
  if (normalized.includes("between 1 and 5")) {
    return "Choose a rating from 1 to 5 stars.";
  }

  return "Unable to save your rating. Please try again.";
}

export async function loadMenuItemRatingSummaries(
  providerMenuItemIds: string[],
): Promise<LoadMenuItemRatingSummariesResult> {
  await requireProfile();

  if (providerMenuItemIds.length === 0) {
    return { ok: true, summaries: [] };
  }

  const uniqueIds = [...new Set(providerMenuItemIds)];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_staff_menu_item_rating_summaries", {
    p_provider_menu_item_ids: uniqueIds,
  });

  if (error) {
    return { ok: false, message: MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE };
  }

  return { ok: true, summaries: parseMenuItemRatingSummaries(data) };
}

export type SaveMenuItemRatingResult =
  | { ok: true; summary: MenuItemRatingSummary; refreshWarning?: string }
  | { ok: false; message: string };

export async function saveMyMenuItemRating(
  providerMenuItemId: string,
  stars: number,
): Promise<SaveMenuItemRatingResult> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("upsert_my_menu_item_rating", {
    p_provider_menu_item_id: providerMenuItemId,
    p_stars: stars,
  });

  if (error) {
    return { ok: false, message: mapRatingRpcError(error.message) };
  }

  const reload = await loadMenuItemRatingSummaries([providerMenuItemId]);

  revalidatePath("/home");
  revalidatePath("/lunch");
  revalidatePath("/my-orders");

  if (!reload.ok) {
    return {
      ok: true,
      summary: {
        providerMenuItemId,
        averageStars: 0,
        ratingCount: 0,
        myStars: stars,
        canSubmitOrUpdate: false,
      },
      refreshWarning: "Saved your rating, but the display could not refresh. Try again.",
    };
  }

  const summary = indexRatingSummaries(reload.summaries).get(providerMenuItemId);

  if (!summary) {
    return {
      ok: true,
      summary: {
        providerMenuItemId,
        averageStars: 0,
        ratingCount: 0,
        myStars: stars,
        canSubmitOrUpdate: false,
      },
      refreshWarning: "Saved your rating, but the display could not refresh. Try again.",
    };
  }

  return { ok: true, summary };
}
