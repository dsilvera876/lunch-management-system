import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapCatalogMenuItemsForStaffOrder,
  mapSnapshotMenuItemsForStaffOrder,
} from "./staff-provider-menu";

const catalog = [
  {
    id: "pmi-main",
    name: "BBQ Chicken",
    description: null,
    price: 850,
    item_type: "main",
    unit_label: "Each",
    display_category: null,
    active: true,
    provider_menu_item_weekdays: [{ weekday: 1 }],
  },
  {
    id: "pmi-side",
    name: "Plain Rice",
    description: null,
    price: 0,
    item_type: "side",
    unit_label: "Each",
    display_category: null,
    active: true,
    provider_menu_item_weekdays: [{ weekday: 1 }],
  },
  {
    id: "pmi-fruit",
    name: "Banana",
    description: null,
    price: 40,
    item_type: "standalone",
    unit_label: "Each",
    display_category: "Fruit",
    active: true,
    provider_menu_item_weekdays: [{ weekday: 1 }],
  },
];

describe("staff provider menu loading", () => {
  it("uses provider_menu_item ids from recurring catalog", () => {
    const items = mapCatalogMenuItemsForStaffOrder(catalog, 1);
    assert.deepEqual(
      items.map((item) => item.id),
      ["pmi-main", "pmi-side", "pmi-fruit"],
    );
  });

  it("maps snapshot rows to provider_menu_item ids, never menu_items.id", () => {
    const snapshot = [
      {
        id: "snapshot-row-main",
        provider_menu_item_id: "pmi-main",
        name: "BBQ Chicken",
        description: null,
        price: 850,
        item_type: "main",
        unit_label: "Each",
        display_category: null,
        is_active: true,
      },
      {
        id: "snapshot-row-side",
        provider_menu_item_id: "pmi-side",
        name: "Plain Rice",
        description: null,
        price: 0,
        item_type: "side",
        unit_label: "Each",
        display_category: null,
        is_active: true,
      },
    ];

    const items = mapSnapshotMenuItemsForStaffOrder(snapshot, catalog, 1);
    assert.deepEqual(
      items.map((item) => item.id),
      ["pmi-main", "pmi-side"],
    );
    assert.doesNotMatch(items[0]?.id ?? "", /snapshot-row/);
  });

  it("drops snapshot rows missing provider_menu_item_id", () => {
    const snapshot = [
      {
        id: "legacy-snapshot-only",
        provider_menu_item_id: null,
        name: "Legacy Item",
        description: null,
        price: 100,
        item_type: "standalone",
        unit_label: "Each",
        display_category: null,
        is_active: true,
      },
    ];

    const items = mapSnapshotMenuItemsForStaffOrder(snapshot, catalog, 1);
    assert.equal(items.length, 0);
  });

  it("drops snapshot rows when catalog item is inactive", () => {
    const inactiveCatalog = catalog.map((item) =>
      item.id === "pmi-fruit" ? { ...item, active: false } : item,
    );
    const snapshot = [
      {
        id: "snapshot-fruit",
        provider_menu_item_id: "pmi-fruit",
        name: "Banana",
        description: null,
        price: 40,
        item_type: "standalone",
        unit_label: "Each",
        display_category: "Fruit",
        is_active: true,
      },
    ];

    const items = mapSnapshotMenuItemsForStaffOrder(snapshot, inactiveCatalog, 1);
    assert.equal(items.length, 0);
  });
});
