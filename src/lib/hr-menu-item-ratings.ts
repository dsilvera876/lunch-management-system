export type HrMenuItemRatingsDashboard = {
  providerId: string;
  providerName: string;
  ratingsEnabled: boolean;
  providerRatingGeneration: number;
  providerAverageStars: number;
  providerRatingCount: number;
  menuItems: HrMenuItemRatingSummaryRow[];
};

export type HrMenuItemRatingSummaryRow = {
  providerMenuItemId: string;
  name: string;
  active: boolean;
  currentRatingGeneration: number;
  averageStars: number;
  ratingCount: number;
};

export type HrCatalogMenuItemRatingsDetail = {
  providerMenuItemId: string;
  name: string;
  providerId: string;
  currentRatingGeneration: number;
  averageStars: number;
  activeRatingCount: number;
  ratings: HrMenuItemRatingRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type HrMenuItemRatingRow = {
  id: string;
  profileId: string;
  employeeName: string;
  stars: number;
  createdAt: string;
  updatedAt: string;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  eligibilityVoidedAt: string | null;
  isActiveForAggregates: boolean;
  canRemove: boolean;
};

export type HrMenuItemRatingsAuditEntry = {
  id: string;
  action: string;
  reason: string;
  providerMenuItemId: string | null;
  menuItemRatingId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  /** Preformatted on the server to avoid locale hydration mismatches in the client UI. */
  createdAtLabel?: string;
  actorId: string;
  actorName: string;
};

export function formatHrMenuItemRatingsAuditTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Jamaica" });
}

export function parseHrMenuItemRatingsDashboard(payload: unknown): HrMenuItemRatingsDashboard | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  if (typeof raw.provider_id !== "string") {
    return null;
  }

  const menuItemsRaw = raw.menu_items;
  const menuItems: HrMenuItemRatingSummaryRow[] = [];

  if (Array.isArray(menuItemsRaw)) {
    for (const row of menuItemsRaw) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const item = row as Record<string, unknown>;
      if (typeof item.provider_menu_item_id !== "string" || typeof item.name !== "string") {
        continue;
      }
      menuItems.push({
        providerMenuItemId: item.provider_menu_item_id,
        name: item.name,
        active: item.active === true,
        currentRatingGeneration: Number(item.current_rating_generation),
        averageStars: Number(item.average_stars),
        ratingCount: Number(item.rating_count),
      });
    }
  }

  return {
    providerId: raw.provider_id,
    providerName: typeof raw.provider_name === "string" ? raw.provider_name : "Provider",
    ratingsEnabled: raw.ratings_enabled === true,
    providerRatingGeneration: Number(raw.provider_rating_generation),
    providerAverageStars: Number(raw.provider_average_stars),
    providerRatingCount: Number(raw.provider_rating_count),
    menuItems,
  };
}

export function parseHrCatalogMenuItemRatingsDetail(
  payload: unknown,
): HrCatalogMenuItemRatingsDetail | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  if (typeof raw.provider_menu_item_id !== "string") {
    return null;
  }

  const ratings: HrMenuItemRatingRow[] = [];
  const ratingsRaw = raw.ratings;

  if (Array.isArray(ratingsRaw)) {
    for (const row of ratingsRaw) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const rating = row as Record<string, unknown>;
      if (typeof rating.id !== "string") {
        continue;
      }
      ratings.push({
        id: rating.id,
        profileId: typeof rating.profile_id === "string" ? rating.profile_id : "",
        employeeName: typeof rating.employee_name === "string" ? rating.employee_name : "Staff member",
        stars: Number(rating.stars),
        createdAt: typeof rating.created_at === "string" ? rating.created_at : "",
        updatedAt: typeof rating.updated_at === "string" ? rating.updated_at : "",
        removedAt: typeof rating.removed_at === "string" ? rating.removed_at : null,
        removedBy: typeof rating.removed_by === "string" ? rating.removed_by : null,
        removalReason: typeof rating.removal_reason === "string" ? rating.removal_reason : null,
        eligibilityVoidedAt:
          typeof rating.eligibility_voided_at === "string" ? rating.eligibility_voided_at : null,
        isActiveForAggregates: rating.is_active_for_aggregates === true,
        canRemove: rating.can_remove === true,
      });
    }
  }

  return {
    providerMenuItemId: raw.provider_menu_item_id,
    name: typeof raw.name === "string" ? raw.name : "Menu item",
    providerId: typeof raw.provider_id === "string" ? raw.provider_id : "",
    currentRatingGeneration: Number(raw.current_rating_generation),
    averageStars: Number(raw.average_stars),
    activeRatingCount: Number(raw.active_rating_count),
    ratings,
    totalCount: Number(raw.total_count ?? ratings.length),
    page: Number(raw.page ?? 1),
    pageSize: Number(raw.page_size ?? ratings.length),
  };
}

export type HrMenuItemRatingsAuditPage = {
  entries: HrMenuItemRatingsAuditEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export function parseHrMenuItemRatingsAudit(payload: unknown): HrMenuItemRatingsAuditPage {
  if (!payload || typeof payload !== "object") {
    return { entries: [], totalCount: 0, page: 1, pageSize: 20 };
  }

  const raw = payload as Record<string, unknown>;
  const entries = raw.entries;
  if (!Array.isArray(entries)) {
    return {
      entries: [],
      totalCount: Number(raw.total_count ?? 0),
      page: Number(raw.page ?? 1),
      pageSize: Number(raw.page_size ?? 20),
    };
  }

  const result: HrMenuItemRatingsAuditEntry[] = [];

  for (const row of entries) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const entry = row as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.action !== "string") {
      continue;
    }

    result.push({
      id: entry.id,
      action: entry.action,
      reason: typeof entry.reason === "string" ? entry.reason : "",
      providerMenuItemId:
        typeof entry.provider_menu_item_id === "string" ? entry.provider_menu_item_id : null,
      menuItemRatingId:
        typeof entry.menu_item_rating_id === "string" ? entry.menu_item_rating_id : null,
      payload:
        entry.payload && typeof entry.payload === "object"
          ? (entry.payload as Record<string, unknown>)
          : {},
      createdAt: typeof entry.created_at === "string" ? entry.created_at : "",
      actorId: typeof entry.actor_id === "string" ? entry.actor_id : "",
      actorName: typeof entry.actor_name === "string" ? entry.actor_name : "HR user",
    });
  }

  return {
    entries: result,
    totalCount: Number(raw.total_count ?? result.length),
    page: Number(raw.page ?? 1),
    pageSize: Number(raw.page_size ?? 20),
  };
}

export function formatHrRatingsActionLabel(action: string): string {
  switch (action) {
    case "remove_rating":
      return "Removed rating";
    case "reset_menu_item":
      return "Reset menu item ratings";
    case "reset_provider":
      return "Reset provider ratings";
    case "enable_ratings":
      return "Enabled ratings";
    case "disable_ratings":
      return "Disabled ratings";
    default:
      return action;
  }
}
