import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ITEM_TYPE_FIELD_HINTS,
  MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
  MANAGE_MENU_TOAST,
  manageMenuFlashToastTitle,
} from "./manage-menu-form";

describe("manage menu form polish", () => {
  it("defines success toast copy and ~4–5s dismiss duration", () => {
    assert.equal(MANAGE_MENU_TOAST.created, "Menu item created.");
    assert.equal(MANAGE_MENU_TOAST.updated, "Menu item updated.");
    assert.equal(MANAGE_MENU_TOAST.activated, "Menu item activated.");
    assert.equal(MANAGE_MENU_TOAST.deactivated, "Menu item deactivated.");
    assert.ok(MANAGE_MENU_SUCCESS_TOAST_DURATION_MS >= 4000);
    assert.ok(MANAGE_MENU_SUCCESS_TOAST_DURATION_MS <= 5000);
    assert.equal(manageMenuFlashToastTitle("menuCreated"), MANAGE_MENU_TOAST.created);
    assert.equal(manageMenuFlashToastTitle("menuUpdated"), MANAGE_MENU_TOAST.updated);
  });

  it("uses compact item type field hints", () => {
    assert.equal(ITEM_TYPE_FIELD_HINTS.main, "Primary meal item.");
    assert.equal(ITEM_TYPE_FIELD_HINTS.side, "Included with a main.");
    assert.equal(ITEM_TYPE_FIELD_HINTS.standalone, "Can be ordered separately.");
  });

  it("omits page-level menu success banners and wires toast feedback", () => {
    const managePage = readFileSync(
      new URL("../app/admin/providers/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editorPanel = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(managePage, /Menu item added/);
    assert.doesNotMatch(managePage, /Menu item updated/);
    assert.doesNotMatch(managePage, /Menu item status updated/);
    assert.doesNotMatch(managePage, /variant="success"/);

    assert.match(workspace, /ToastProvider/);
    assert.match(workspace, /useToast/);
    assert.match(editorPanel, /showToast/);
    assert.match(editorPanel, /MANAGE_MENU_TOAST\.created/);
    assert.match(editorPanel, /MANAGE_MENU_TOAST\.updated/);
    assert.match(editorPanel, /MANAGE_MENU_TOAST\.activated/);
    assert.match(editorPanel, /MANAGE_MENU_TOAST\.deactivated/);
  });

  it("uses Price label without JMD suffix and stable weekday grid", () => {
    const formFields = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-form-fields.tsx", import.meta.url),
      "utf8",
    );
    const weekdayPicker = readFileSync(
      new URL("../components/weekday-picker.tsx", import.meta.url),
      "utf8",
    );
    const typeFields = readFileSync(
      new URL("../components/menu-item-type-fields.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(formFields, /Price \(JMD\)/);
    assert.match(formFields, /label="Price"/);
    assert.match(formFields, /legend="Available on"/);
    assert.match(formFields, /showDescription=\{false\}/);

    assert.doesNotMatch(weekdayPicker, /\(Mon–Fri\)/);
    assert.match(weekdayPicker, /grid grid-cols-5 gap-2/);
    assert.match(weekdayPicker, /WEEKDAYS\.map/);
    assert.doesNotMatch(weekdayPicker, /✓/);

    assert.doesNotMatch(formFields, /Staff can order this item/);
    assert.doesNotMatch(typeFields, /No category is stored as unset/);
    assert.doesNotMatch(typeFields, /Ignored for mains and sides/);
    assert.match(typeFields, /ITEM_TYPE_FIELD_HINTS/);
    assert.match(typeFields, /Price is per unit/);
  });

  it("preserves quick-add local menu update and form reset", () => {
    const editorPanel = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(editorPanel, /createProviderMenuItemInline/);
    assert.match(editorPanel, /onItemCreated\(result\.item\)/);
    assert.match(editorPanel, /addSession/);
    assert.match(workspace, /mergeManageMenuItem/);
    assert.match(workspace, /onItemCreated=\{handleMenuItemSaved\}/);
  });
});
