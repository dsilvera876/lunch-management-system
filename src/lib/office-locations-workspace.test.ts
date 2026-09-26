import assert from "node:assert/strict";
import { accessSync } from "node:fs";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getBreadcrumbs } from "./breadcrumbs";

function pathExists(relativePath: string): boolean {
  try {
    accessSync(new URL(relativePath, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

describe("office locations workspace", () => {
  it("defaults to Add mode and uses a persistent editor panel", () => {
    const workspace = readFileSync(
      new URL("../components/admin/office-locations-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editor = readFileSync(
      new URL("../components/admin/office-locations-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/locations/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /OfficeLocationsWorkspace/);
    assert.match(workspace, /OfficeLocationsEditorPanel/);
    assert.match(workspace, /editingLocationId/);
    assert.match(editor, /Add location/);
    assert.match(editor, /Create location/);
    assert.doesNotMatch(page, /Manage location/);
  });

  it("loads Edit mode from list selection with row highlight and cancel", () => {
    const workspace = readFileSync(
      new URL("../components/admin/office-locations-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editor = readFileSync(
      new URL("../components/admin/office-locations-editor-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /selectLocationForEdit/);
    assert.match(workspace, /editingLocationId === location\.id/);
    assert.match(workspace, /bg-primary\/\[0\.06\]/);
    assert.match(editor, /Edit location/);
    assert.match(editor, /Save changes/);
    assert.match(editor, /Cancel editing/);
    assert.match(editor, /resetToAddMode/);
  });

  it("uses inline mutations with local list updates and toasts", () => {
    const editor = readFileSync(
      new URL("../components/admin/office-locations-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/office-locations-workspace.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/locations/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(editor, /createOfficeLocationInline/);
    assert.match(editor, /updateOfficeLocationInline/);
    assert.match(editor, /onLocationCreated\(result\.location\)/);
    assert.match(editor, /OFFICE_LOCATIONS_TOAST\.updated/);
    assert.match(workspace, /mergeOfficeLocation/);
    assert.match(actions, /delete_unused_office_location/);
    assert.match(editor, /toggleOfficeLocationActiveInline/);
    assert.match(editor, /deleteUnusedOfficeLocationInline/);
  });

  it("retires the separate location detail page", () => {
    assert.equal(pathExists("../app/admin/locations/[id]/page.tsx"), true);
    const detail = readFileSync(
      new URL("../app/admin/locations/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(detail, /redirect\("\/admin\/locations"\)/);
    assert.doesNotMatch(detail, /updateOfficeLocation/);
  });
});

describe("office locations breadcrumbs and admin redirect", () => {
  it("uses Settings parent for Office Locations", () => {
    const crumbs = getBreadcrumbs("/admin/locations");

    assert.deepEqual(crumbs, [
      { label: "Home", href: "/home" },
      { label: "Settings", href: "/admin/settings" },
      { label: "Office Locations" },
    ]);
  });

  it("does not link Administration to /admin", () => {
    const crumbs = getBreadcrumbs("/admin/todays-orders");

    assert.ok(crumbs.some((crumb) => crumb.label === "Administration"));
    assert.ok(
      !crumbs.some((crumb) => crumb.label === "Administration" && crumb.href === "/admin"),
    );
  });

  it("uses Lunch Providers without Administration for provider overview", () => {
    const crumbs = getBreadcrumbs("/admin/providers");

    assert.deepEqual(crumbs, [
      { label: "Home", href: "/home" },
      { label: "Lunch Providers" },
    ]);
  });

  it("redirects /admin to /home", () => {
    const adminPage = readFileSync(
      new URL("../app/admin/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(adminPage, /redirect\("\/home"\)/);
  });
});
