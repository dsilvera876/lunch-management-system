import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildProviderCartSections,
  canAddDraftToCart,
  countDistinctProviders,
  createCartEntryFromDraft,
  findUnfinishedWorkingDrafts,
  formatUnfinishedDraftMessage,
  groupCartEntriesForDisplay,
  listInProgressDrafts,
  snapshotDraftForCart,
} from "./lunch-cart";
import {
  removeMain,
  removeSide,
} from "./lunch-order-draft";
import { validateLunchCart } from "./lunch-checkout";
import {
  addSide,
  addStandalone,
  emptyProviderDraft,
  replaceMain,
} from "./lunch-order-draft";

const providers = [
  {
    id: "provider-a",
    name: "Alberries Caterors",
    description: null,
    menuItems: [
      {
        id: "main-1",
        name: "Fried Chicken",
        price: 850,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
      {
        id: "side-1",
        name: "Rice & Peas",
        price: 0,
        itemType: "side" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
    ],
  },
  {
    id: "provider-b",
    name: "Peel Good Fruits",
    description: null,
    menuItems: [
      {
        id: "apple",
        name: "Banana",
        price: 40,
        itemType: "standalone" as const,
        unitLabel: "Each",
        displayCategory: "Fruit",
        description: null,
      },
    ],
  },
];

function completeMealDraft(instructions = "") {
  let draft = replaceMain(emptyProviderDraft(), "main-1");
  draft = addSide(draft, "side-1");
  draft = { ...draft, specialInstructions: instructions };
  return draft;
}

describe("lunch cart", () => {
  it("does not include working drafts in cart validation until snapshotted", () => {
    const drafts = { "provider-a": completeMealDraft() };
    const cart = validateLunchCart(providers, []);
    assert.equal(cart.entries.length, 0);
    assert.equal(findUnfinishedWorkingDrafts(providers, drafts).length, 1);
  });

  it("allows valid draft to be added and invalid draft cannot be added", () => {
    const valid = completeMealDraft();
    const invalid = replaceMain(emptyProviderDraft(), "main-1");

    assert.equal(canAddDraftToCart(valid), true);
    assert.equal(canAddDraftToCart(invalid), false);
  });

  it("snapshots instructions and quantities independently per cart entry", () => {
    let draftOne = completeMealDraft("Extra gravy");
    draftOne = { ...draftOne, mealQuantity: 2 };

    let draftTwo = completeMealDraft("No gravy");
    draftTwo = { ...draftTwo, mealQuantity: 1 };

    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, draftOne), id: "entry-1" },
      { ...createCartEntryFromDraft(providers[0]!, draftTwo), id: "entry-2" },
    ];

    assert.equal(cart[0]!.draft.specialInstructions, "Extra gravy");
    assert.equal(cart[1]!.draft.specialInstructions, "No gravy");
    assert.equal(cart[0]!.draft.mealQuantity, 2);
    assert.equal(cart[1]!.draft.mealQuantity, 1);
  });

  it("supports multiple cart entries for the same provider", () => {
    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft()), id: "a1" },
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft("Second")), id: "a2" },
      {
        ...createCartEntryFromDraft(providers[1]!, addStandalone(emptyProviderDraft(), "apple")),
        id: "b1",
      },
    ];

    const checkout = validateLunchCart(providers, cart);
    assert.equal(checkout.entries.length, 3);
    assert.equal(countDistinctProviders(cart), 2);

    const grouped = groupCartEntriesForDisplay(cart);
    assert.equal(grouped[0]!.entries.length, 2);
    assert.equal(grouped[0]!.entries[1]!.providerOrderIndex, 2);
  });

  it("builds RPC payload with repeated provider ids", () => {
    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft("One")), id: "1" },
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft("Two")), id: "2" },
    ];
    const checkout = validateLunchCart(providers, cart);
    const providerIds = checkout.entries.map((entry) => entry.providerId);
    assert.deepEqual(providerIds, ["provider-a", "provider-a"]);
  });

  it("formats unfinished draft guidance for one or many providers", () => {
    const one = [{ providerId: "provider-a", providerName: "Alberries Caterors" }];
    const many = [
      { providerId: "provider-a", providerName: "Alberries Caterors" },
      { providerId: "provider-b", providerName: "Peel Good Fruits" },
    ];

    assert.match(formatUnfinishedDraftMessage(one), /Finish the in-progress order for Alberries/);
    assert.match(formatUnfinishedDraftMessage(many), /Finish the in-progress orders for/);
  });

  it("lists in-progress drafts with presentation-only order numbers", () => {
    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft()), id: "done-1" },
    ];
    const drafts = {
      "provider-a": completeMealDraft("Second order"),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };

    const inProgress = listInProgressDrafts(providers, drafts, cart);
    assert.equal(inProgress.length, 2);
    assert.equal(inProgress[0]?.providerOrderIndex, 2);
    assert.equal(inProgress[1]?.providerOrderIndex, 1);
  });

  it("builds cart sections with completed and in-progress orders per provider", () => {
    const cart = [
      { ...createCartEntryFromDraft(providers[0]!, completeMealDraft()), id: "done-1" },
    ];
    const drafts = { "provider-a": completeMealDraft("Next") };

    const sections = buildProviderCartSections(providers, cart, drafts);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.completedEntries.length, 1);
    assert.equal(sections[0]?.inProgress?.providerOrderIndex, 2);
  });

  it("removing in-progress items updates draft state used by menu Added controls", () => {
    let draft = completeMealDraft();
    draft = removeSide(draft, "side-1");
    assert.equal(canAddDraftToCart(draft), false);

    draft = removeMain(draft);
    assert.equal(findUnfinishedWorkingDrafts(providers, { "provider-a": draft }).length, 0);
  });

  it("finish order creates one cart entry and clears only that provider draft", () => {
    const draft = completeMealDraft();
    const entry = createCartEntryFromDraft(providers[0]!, draft);
    const draftsAfter = {
      "provider-a": emptyProviderDraft(),
      "provider-b": addStandalone(emptyProviderDraft(), "apple"),
    };

    assert.equal(entry.providerId, "provider-a");
    assert.equal(findUnfinishedWorkingDrafts(providers, draftsAfter).length, 1);
  });

  it("snapshotDraftForCart clones mutable draft fields", () => {
    const draft = completeMealDraft();
    draft.sideIds.push("mutated");
    const snapshot = snapshotDraftForCart(completeMealDraft());
    assert.deepEqual(snapshot.sideIds, ["side-1"]);
  });

  it("wires lunch cart UI in workspace", () => {
    const workspaceSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );
    const menuSource = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspaceSource, /LunchCartPanel/);
    assert.match(workspaceSource, /cartEntries/);
    assert.match(menuSource, /Finish This Order/);
    assert.match(menuSource, /IconCheck/);
    assert.doesNotMatch(workspaceSource, /CombinedOrderSummaryPanel/);
  });
});
