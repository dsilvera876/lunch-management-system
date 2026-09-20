import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  assertCheckoutDraftsMatchLoadedMenus,
  buildCheckoutRpcPayload,
  clearAllCheckoutDrafts,
  clearCheckoutDrafts,
  draftHasSelectedItems,
  validateLunchCart,
  validateLunchCheckout,
} from "./lunch-checkout";
import { createCartEntryFromDraft } from "./lunch-cart";
import {
  addSide,
  addStandalone,
  emptyProviderDraft,
  replaceMain,
} from "./lunch-order-draft";
import { calculateMarginalOrderCheckout } from "./order-subsidy-preview";

const providers = [
  {
    id: "provider-a",
    name: "Alberries Caterors",
    description: null,
    menuItems: [
      { id: "main-1", name: "Fried Chicken", price: 850, itemType: "main" as const, unitLabel: "Each", displayCategory: null, description: null },
      { id: "side-1", name: "Rice & Peas", price: 0, itemType: "side" as const, unitLabel: "Each", displayCategory: null, description: null },
    ],
  },
  {
    id: "provider-b",
    name: "Peel Good Fruits",
    description: null,
    menuItems: [
      { id: "apple", name: "Banana", price: 40, itemType: "standalone" as const, unitLabel: "Each", displayCategory: "Fruit", description: null },
    ],
  },
];

describe("lunch checkout", () => {
  it("aggregates non-empty provider drafts and ignores empty providers", () => {
    const drafts = {
      "provider-a": (() => {
        let draft = replaceMain(emptyProviderDraft(), "main-1");
        draft = addSide(draft, "side-1");
        return draft;
      })(),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };

    const checkout = validateLunchCheckout(providers, drafts);
    assert.equal(checkout.entries.length, 2);
    assert.equal(checkout.combinedSubtotal, 850 + 40);
    assert.equal(checkout.canSubmit, true);
  });

  it("blocks checkout when one provider meal is incomplete without duplicating inline guidance", () => {
    const drafts = {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };

    const checkout = validateLunchCheckout(providers, drafts);
    assert.equal(checkout.canSubmit, false);
    assert.equal(checkout.guidanceMessage, null);
    assert.equal(
      checkout.entries.find((entry) => entry.providerId === "provider-a")?.validation.mealIncomplete,
      true,
    );
  });

  it("applies subsidy once across combined subtotal", () => {
    const subtotal = 1310;
    const checkout = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 0,
      orderSubtotal: subtotal,
    });
    assert.equal(checkout.youPay, 810);
  });

  it("clears only submitted provider drafts after success", () => {
    const drafts = {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };

    const cleared = clearCheckoutDrafts(drafts, ["provider-a"]);
    assert.equal(draftHasSelectedItems(cleared["provider-a"]), false);
    assert.equal(draftHasSelectedItems(cleared["provider-b"]), true);
  });

  it("clear all resets every provider draft", () => {
    const drafts = {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };
    const cleared = clearAllCheckoutDrafts(providers, drafts);
    assert.equal(Object.keys(cleared["provider-a"].standaloneQuantities).length, 0);
    assert.equal(cleared["provider-a"].mainId, null);
  });

  it("builds RPC payload with provider-specific instructions", () => {
    let draftA = replaceMain(emptyProviderDraft(), "main-1");
    draftA = addSide(draftA, "side-1");
    draftA = { ...draftA, specialInstructions: "Extra gravy" };

    const checkout = validateLunchCheckout(providers, {
      "provider-a": draftA,
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    });

    const payload = buildCheckoutRpcPayload(checkout.entries);
    assert.equal(payload.length, 2);
    assert.equal(payload[0]?.special_instructions, "Extra gravy");
  });

  it("rejects checkout drafts whose item ids are not in the loaded staff menu", () => {
    let draftA = replaceMain(emptyProviderDraft(), "main-1");
    draftA = addSide(draftA, "side-1");
    const checkout = validateLunchCheckout(providers, { "provider-a": draftA });
    const tampered = {
      ...checkout.entries[0]!,
      draft: replaceMain(emptyProviderDraft(), "unknown-main"),
    };

    const alignment = assertCheckoutDraftsMatchLoadedMenus(providers, [tampered]);
    assert.equal(alignment.ok, false);
    assert.equal(alignment.providerName, "Alberries Caterors");
  });

  it("does not block repeat same-provider checkouts at validation layer", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    const first = validateLunchCheckout(providers, { "provider-a": draft });
    const second = validateLunchCheckout(providers, { "provider-a": draft });

    assert.equal(first.canSubmit, true);
    assert.equal(second.canSubmit, true);
    assert.equal(first.entries.length, 1);
    assert.equal(second.entries.length, 1);
  });

  it("applies remaining subsidy when prior same-day gross was already consumed", () => {
    const afterFirstCheckout = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 850,
      orderSubtotal: 850,
    });

    assert.equal(afterFirstCheckout.lunchSubsidy, 0);
    assert.equal(afterFirstCheckout.youPay, 850);
  });

  it("allows repeated provider ids in one cart checkout payload", () => {
    let draftOne = replaceMain(emptyProviderDraft(), "main-1");
    draftOne = addSide(draftOne, "side-1");
    let draftTwo = replaceMain(emptyProviderDraft(), "main-1");
    draftTwo = addSide(draftTwo, "side-1");

    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, draftOne), id: "order-1" },
      { ...createCartEntryFromDraft(providers[0]!, draftTwo), id: "order-2" },
    ];

    const checkout = validateLunchCart(providers, cart);
    const payload = buildCheckoutRpcPayload(checkout.entries);
    assert.equal(payload.length, 2);
    assert.equal(payload[0]?.provider_id, "provider-a");
    assert.equal(payload[1]?.provider_id, "provider-a");
  });

  it("documents repeat-order database guardrails in migration", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../supabase/migrations/20260918190000_allow_repeat_provider_orders.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const repeatCheckoutMigration = readFileSync(
      new URL(
        "../../supabase/migrations/20260919100000_allow_repeat_providers_in_checkout.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migrationSource, /one_active_order_per_user_per_lunch_day/);
    assert.doesNotMatch(repeatCheckoutMigration, /Duplicate provider in checkout/);
    assert.match(repeatCheckoutMigration, /submit_provider_checkout/);
  });

  it("uses atomic submit_provider_checkout server path", () => {
    const actionsSource = readFileSync(
      new URL("../app/lunch/actions.ts", import.meta.url),
      "utf8",
    );
    const migrationSource = readFileSync(
      new URL("../../supabase/migrations/20260918180000_add_order_group_checkout.sql", import.meta.url),
      "utf8",
    );
    const workspaceSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(actionsSource, /submit_provider_checkout/);
    assert.match(migrationSource, /order_group_id/);
    assert.match(migrationSource, /submit_provider_checkout/);
    assert.match(workspaceSource, /submitLunchCheckout/);
    assert.match(workspaceSource, /LunchCartPanel/);
    assert.doesNotMatch(workspaceSource, /submitProviderOrder/);
  });
});
