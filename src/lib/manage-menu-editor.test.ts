import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("manage menu persistent editor", () => {
  it("defaults to Add mode and uses unified editor panel", () => {
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editor = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /MenuItemEditorPanel/);
    assert.doesNotMatch(workspace, /MenuItemDrawer/);
    assert.doesNotMatch(workspace, /AddMenuItemPanel/);
    assert.match(workspace, /editingItemId/);
    assert.match(editor, /Add menu item/);
    assert.match(editor, /Create menu item/);
    assert.match(editor, /mode === "add"/);
  });

  it("selects item on Edit and highlights the row", () => {
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /selectItemForEdit/);
    assert.match(workspace, /editingItemId === item\.id/);
    assert.match(workspace, /ring-primary/);
  });

  it("populates editor in Edit mode with save, cancel, lifecycle actions", () => {
    const editor = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(editor, /Edit menu item/);
    assert.match(editor, /Save changes/);
    assert.match(editor, /Cancel editing/);
    assert.match(editor, /updateProviderMenuItemInline/);
    assert.match(editor, /resetToAddMode/);
    assert.match(editor, /toggleProviderMenuItemActiveInline/);
    assert.match(editor, /deleteProviderMenuItemInline/);
    assert.match(editor, /MenuItemFormFields/);
  });

  it("keeps edit selection when item drops out of weekday-filtered list", () => {
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /menuItems\.find/);
    assert.match(workspace, /editingItemId/);
    assert.doesNotMatch(workspace, /setEditingItemId\(null\).*deactivat/i);
  });

  it("preserves create workflow and local merge on save", () => {
    const editor = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(editor, /createProviderMenuItemInline/);
    assert.match(editor, /onItemCreated\(result\.item\)/);
    assert.match(editor, /MANAGE_MENU_TOAST\.updated/);
    assert.match(workspace, /mergeManageMenuItem/);
    assert.match(workspace, /removeManageMenuItem/);
  });
});
