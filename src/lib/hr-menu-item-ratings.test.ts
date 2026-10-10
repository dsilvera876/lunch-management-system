import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatHrRatingsActionLabel,
  parseHrCatalogMenuItemRatingsDetail,
  parseHrMenuItemRatingsAudit,
  parseHrMenuItemRatingsDashboard,
} from "@/lib/hr-menu-item-ratings";

describe("HR menu item ratings parsing", () => {
  it("parses provider dashboard payloads", () => {
    const parsed = parseHrMenuItemRatingsDashboard({
      provider_id: "88888888-8888-4888-8888-888888888888",
      provider_name: "Test Provider",
      ratings_enabled: true,
      provider_rating_generation: 2,
      provider_average_stars: "3.50",
      provider_rating_count: 4,
      menu_items: [
        {
          provider_menu_item_id: "a1111111-1111-4111-8111-111111111111",
          name: "Chicken",
          active: true,
          current_rating_generation: 2,
          average_stars: "4.00",
          rating_count: 2,
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed.providerId, "88888888-8888-4888-8888-888888888888");
    assert.equal(parsed.providerAverageStars, 3.5);
    assert.equal(parsed.menuItems.length, 1);
    assert.equal(parsed.menuItems[0]?.ratingCount, 2);
  });

  it("parses catalog detail and audit entries", () => {
    const detail = parseHrCatalogMenuItemRatingsDetail({
      provider_menu_item_id: "a1111111-1111-4111-8111-111111111111",
      name: "Chicken",
      provider_id: "88888888-8888-4888-8888-888888888888",
      current_rating_generation: 1,
      average_stars: 3,
      active_rating_count: 1,
      total_count: 42,
      page: 2,
      page_size: 20,
      ratings: [
        {
          id: "r1",
          profile_id: "p1",
          employee_name: "Staff One",
          stars: 3,
          created_at: "2099-01-01T12:00:00Z",
          updated_at: "2099-01-01T12:00:00Z",
          removed_at: null,
          removed_by: null,
          removal_reason: null,
          eligibility_voided_at: null,
          is_active_for_aggregates: true,
          can_remove: true,
        },
      ],
    });

    assert.ok(detail);
    assert.equal(detail.ratings[0]?.canRemove, true);
    assert.equal(detail.totalCount, 42);
    assert.equal(detail.page, 2);
    assert.equal(detail.pageSize, 20);

    const audit = parseHrMenuItemRatingsAudit({
      total_count: 1,
      page: 1,
      page_size: 20,
      entries: [
        {
          id: "a1",
          action: "reset_provider",
          reason: "Fresh period",
          provider_menu_item_id: null,
          menu_item_rating_id: null,
          payload: { new_provider_rating_generation: 2 },
          created_at: "2099-01-02T12:00:00Z",
          actor_id: "hr1",
          actor_name: "HR User",
        },
      ],
    });

    assert.equal(audit.entries.length, 1);
    assert.equal(audit.totalCount, 1);
    assert.equal(formatHrRatingsActionLabel("reset_provider"), "Reset provider ratings");
  });
});
