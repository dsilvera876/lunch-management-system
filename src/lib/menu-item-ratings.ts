export const MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE =
  "Menu item ratings could not be loaded. Please try again.";

export type LoadMenuItemRatingSummariesResult =
  | { ok: true; summaries: MenuItemRatingSummary[] }
  | { ok: false; message: string };

export type MenuItemRatingSummary = {
  providerMenuItemId: string;
  averageStars: number;
  ratingCount: number;
  myStars: number | null;
  canSubmitOrUpdate: boolean;
  isMostPopular: boolean;
};

type RawSummary = {
  provider_menu_item_id: string;
  average_stars: number | string;
  rating_count: number | string;
  my_stars: number | null;
  can_submit_or_update: boolean;
  is_most_popular?: boolean;
};

export function parseMenuItemRatingSummaries(payload: unknown): MenuItemRatingSummary[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const summaries = (payload as { summaries?: unknown }).summaries;
  if (!Array.isArray(summaries)) {
    return [];
  }

  const result: MenuItemRatingSummary[] = [];

  for (const row of summaries) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const raw = row as RawSummary;
    if (typeof raw.provider_menu_item_id !== "string") {
      continue;
    }

    result.push({
      providerMenuItemId: raw.provider_menu_item_id,
      averageStars: Number(raw.average_stars),
      ratingCount: Number(raw.rating_count),
      myStars: raw.my_stars == null ? null : Number(raw.my_stars),
      canSubmitOrUpdate: raw.can_submit_or_update === true,
      isMostPopular: raw.is_most_popular === true,
    });
  }

  return result;
}

export function indexRatingSummaries(
  summaries: MenuItemRatingSummary[],
): Map<string, MenuItemRatingSummary> {
  return new Map(summaries.map((summary) => [summary.providerMenuItemId, summary]));
}

export function formatCommunityRatingLabel(summary: MenuItemRatingSummary): string {
  if (summary.ratingCount <= 0) {
    return "No ratings yet";
  }

  const average = Number.isFinite(summary.averageStars)
    ? summary.averageStars.toFixed(1)
    : "0.0";
  const countLabel = summary.ratingCount === 1 ? "1 rating" : `${summary.ratingCount} ratings`;
  return `${average} average · ${countLabel}`;
}
