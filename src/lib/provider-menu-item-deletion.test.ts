import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE,
  isProviderMenuItemInUseDeletionError,
} from "./unused-record-deletion";
import { removeManageMenuItem } from "./lunch-providers-presentation";

describe("provider menu item permanent deletion", () => {
  it("detects in-use deletion errors from RPC message", () => {
    assert.ok(
      isProviderMenuItemInUseDeletionError(PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE),
    );
    assert.match(
      PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE,
      /Deactivate it instead/,
    );
  });

  it("removes deleted items from manage menu local state", () => {
    const items = [
      {
        id: "a",
        name: "A",
        description: null,
        price: 1,
        itemType: "standalone" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: true,
        weekdays: [1],
      },
      {
        id: "b",
        name: "B",
        description: null,
        price: 2,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: true,
        weekdays: [2],
      },
    ];

    const next = removeManageMenuItem(items, "a");
    assert.deepEqual(next.map((item) => item.id), ["b"]);
  });

  it("wires manage menu navigation and delete UX", () => {
    const manageMenu = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editorPanel = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/providers/[id]/actions.ts", import.meta.url),
      "utf8",
    );
    const managePage = readFileSync(
      new URL("../app/admin/providers/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(manageMenu, /All providers/);

    assert.match(editorPanel, /deleteProviderMenuItemInline/);
    assert.match(editorPanel, /Delete permanently/);
    assert.match(editorPanel, /cannot be undone/);
    assert.match(editorPanel, /PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE/);
    assert.match(editorPanel, /MANAGE_MENU_TOAST\.deleted/);
    assert.match(editorPanel, /canDeletePermanently/);

    assert.match(actions, /delete_unused_provider_menu_item/);
    assert.match(managePage, /usedProviderMenuItemIds/);
    assert.match(managePage, /menu_items/);
    assert.match(manageMenu, /removeManageMenuItem/);
    assert.match(manageMenu, /onItemDeleted/);
    assert.doesNotMatch(manageMenu, /MenuItemDrawer/);
  });
});
