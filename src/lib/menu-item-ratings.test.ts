import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCommunityRatingLabel,
  indexRatingSummaries,
  parseMenuItemRatingSummaries,
} from "@/lib/menu-item-ratings";
import { menuItemRatingStatusMessage } from "@/lib/menu-item-ratings-presentation";
import {
  collectCatalogIdsFromDeliveredCheckouts,
  collectCatalogIdsFromProviderMenus,
  collectRecentRateableMenuItems,
  menuItemRatingsFromLoadResult,
  toRatingSummariesRecord,
} from "@/lib/menu-item-ratings-collect";
import { isProviderOrderEligibleForMenuItemRatingsUi } from "@/lib/menu-item-ratings-eligibility-ui";
import { MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE } from "@/lib/menu-item-ratings";
import type { GroupedCheckout } from "@/lib/staff-my-orders";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";

describe("menu item ratings parsing", () => {
  it("parses batch RPC payloads", () => {
    const parsed = parseMenuItemRatingSummaries({
      summaries: [
        {
          provider_menu_item_id: "31000001-0001-4001-8001-000000000001",
          average_stars: "4.50",
          rating_count: 2,
          my_stars: 5,
          can_submit_or_update: false,
          is_most_popular: true,
        },
      ],
    });

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.providerMenuItemId, "31000001-0001-4001-8001-000000000001");
    assert.equal(parsed[0]?.averageStars, 4.5);
    assert.equal(parsed[0]?.ratingCount, 2);
    assert.equal(parsed[0]?.myStars, 5);
    assert.equal(parsed[0]?.canSubmitOrUpdate, false);
    assert.equal(parsed[0]?.isMostPopular, true);
  });

  it("defaults most popular to false when omitted", () => {
    const parsed = parseMenuItemRatingSummaries({
      summaries: [
        {
          provider_menu_item_id: "a",
          average_stars: 3,
          rating_count: 1,
          my_stars: null,
          can_submit_or_update: true,
        },
      ],
    });
    assert.equal(parsed[0]?.isMostPopular, false);
  });

  it("formats community labels and indexes summaries", () => {
    const summary = {
      providerMenuItemId: "a",
      averageStars: 4.25,
      ratingCount: 4,
      myStars: null,
      canSubmitOrUpdate: true,
      isMostPopular: false,
    };

    assert.equal(formatCommunityRatingLabel(summary), "4.3 average · 4 ratings");
    assert.equal(indexRatingSummaries([summary]).get("a"), summary);
    assert.deepEqual(toRatingSummariesRecord([summary]), { a: summary });
  });

  it("builds status copy for interactive and saved states", () => {
    assert.equal(
      menuItemRatingStatusMessage(undefined, "Saved 4 of 5 stars for BBQ Chicken."),
      "Saved 4 of 5 stars for BBQ Chicken.",
    );

    assert.equal(
      menuItemRatingStatusMessage(
        {
          providerMenuItemId: "a",
          averageStars: 4,
          ratingCount: 1,
          myStars: 3,
          canSubmitOrUpdate: false,
          isMostPopular: false,
        },
        null,
      ),
      "Your rating: 3 of 5 stars",
    );

    assert.equal(
      menuItemRatingStatusMessage(
        {
          providerMenuItemId: "a",
          averageStars: 0,
          ratingCount: 0,
          myStars: null,
          canSubmitOrUpdate: true,
          isMostPopular: false,
        },
        null,
      ),
      "Select stars to rate this item.",
    );
  });
});

describe("menu item ratings load and eligibility", () => {
  it("maps failed RPC loads without empty summaries masquerading as success", () => {
    const failed = menuItemRatingsFromLoadResult({
      ok: false,
      message: MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE,
    });
    assert.equal(failed.loadFailed, true);
    assert.deepEqual(failed.summariesById, {});
  });

  it("aligns UI eligibility with post-receipt order states", () => {
    assert.equal(
      isProviderOrderEligibleForMenuItemRatingsUi({
        status: "submitted",
        deliveryState: "resolved",
      }),
      true,
    );
    assert.equal(
      isProviderOrderEligibleForMenuItemRatingsUi({
        status: "submitted",
        deliveryState: "pending",
      }),
      false,
    );
    assert.equal(
      isProviderOrderEligibleForMenuItemRatingsUi({
        status: "cancelled",
        deliveryState: "delivered",
      }),
      false,
    );
  });
});

describe("menu item ratings collection", () => {
  const providerMenus: ProviderMenuBundle[] = [
    {
      id: "p1",
      name: "Enabled",
      description: null,
      iconKey: "utensils",
      ratingsEnabled: true,
      menuItems: [
        {
          id: "item-1",
          name: "Main",
          description: null,
          price: 10,
          itemType: "main",
          unitLabel: "Each",
          displayCategory: null,
        },
      ],
    },
    {
      id: "p2",
      name: "Disabled",
      description: null,
      iconKey: "utensils",
      ratingsEnabled: false,
      menuItems: [
        {
          id: "item-2",
          name: "Other",
          description: null,
          price: 5,
          itemType: "standalone",
          unitLabel: "Each",
          displayCategory: null,
        },
      ],
    },
  ];

  it("collects catalog ids only for ratings-enabled providers", () => {
    assert.deepEqual(collectCatalogIdsFromProviderMenus(providerMenus), ["item-1"]);
  });

  it("collects delivered checkout catalog ids and recent rateable items", () => {
    const checkout: GroupedCheckout = {
      orderGroupId: "g1",
      deliveryDate: "2026-01-10",
      orderDate: "2026-01-07",
      placedAt: "2026-01-07T12:00:00Z",
      officeLocationName: "Camp Road",
      providerOrders: [
        {
          id: "o1",
          providerId: "p1",
          providerName: "Enabled",
          ratingsEnabled: true,
          indexInGroup: 1,
          groupOrderCount: 1,
          status: "fulfilled",
          deliveryState: "delivered",
          financialDisposition: "chargeable",
          specialInstructions: null,
          mealQuantity: 1,
          lines: [
            {
              name: "Main",
              quantity: 1,
              itemType: "main",
              unitLabel: "Each",
              unitPrice: 10,
              lineTotal: 10,
              providerMenuItemId: "item-1",
            },
          ],
          orderTotal: 10,
          statusLabel: "Delivered",
          isLateOrder: false,
          createdAt: "2026-01-07T12:00:00Z",
        },
      ],
      providerCount: 1,
      orderCount: 1,
      checkoutStatusLabel: "Delivered",
      checkoutStatusKind: "delivered",
      subtotal: 10,
      lunchSubsidy: 0,
      youPay: 10,
      payLabel: "You Paid",
      deliveredAt: "2026-01-10T18:00:00Z",
      cancelledAt: null,
      cancellationSummary: null,
    };

    assert.deepEqual(collectCatalogIdsFromDeliveredCheckouts([checkout]), ["item-1"]);
    assert.deepEqual(collectRecentRateableMenuItems([checkout], 3), [
      {
        providerMenuItemId: "item-1",
        itemName: "Main",
        deliveryDate: "2026-01-10",
      },
    ]);

    const withSide = {
      ...checkout,
      providerOrders: [
        {
          ...checkout.providerOrders[0]!,
          lines: [
            ...checkout.providerOrders[0]!.lines,
            {
              name: "Side salad",
              quantity: 1,
              itemType: "side" as const,
              unitLabel: "Each",
              unitPrice: 3,
              lineTotal: 3,
              providerMenuItemId: "item-side",
            },
          ],
        },
      ],
    };
    assert.deepEqual(collectRecentRateableMenuItems([withSide], 5), [
      {
        providerMenuItemId: "item-1",
        itemName: "Main",
        deliveryDate: "2026-01-10",
      },
    ]);
  });
});
