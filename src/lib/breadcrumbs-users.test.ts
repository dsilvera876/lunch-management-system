import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getBreadcrumbs } from "./breadcrumbs";

describe("users and bulk import breadcrumbs", () => {
  it("shows Home / Users for HR on the users directory", () => {
    const crumbs = getBreadcrumbs("/admin/users", { role: "hr" });

    assert.deepEqual(crumbs, [
      { label: "Home", href: "/home" },
      { label: "Users" },
    ]);
    assert.ok(!crumbs.some((crumb) => crumb.label === "Administration"));
  });

  it("shows Home / Users / Bulk Import for HR bulk import", () => {
    const crumbs = getBreadcrumbs("/admin/users/import", { role: "hr" });

    assert.deepEqual(crumbs, [
      { label: "Home", href: "/home" },
      { label: "Users", href: "/admin/users" },
      { label: "Bulk Import" },
    ]);
  });

  it("shows Home / Administration / Users for Admin and Owner", () => {
    for (const role of ["admin", "owner"] as const) {
      const crumbs = getBreadcrumbs("/admin/users", { role });

      assert.deepEqual(crumbs, [
        { label: "Home", href: "/home" },
        { label: "Administration" },
        { label: "Users" },
      ]);
    }
  });

  it("restricts bulk import to HR in routing", () => {
    const importPage = readFileSync(
      new URL("../app/admin/users/import/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(importPage, /profile\.role !== "hr"/);
    assert.match(importPage, /redirect\("\/admin\/users"\)/);
  });

  it("passes profile role into breadcrumb resolution", () => {
    const header = readFileSync(
      new URL("../components/app-shell/top-header.tsx", import.meta.url),
      "utf8",
    );

    assert.match(header, /getBreadcrumbs\(pathname, \{ role: profile\.role \}\)/);
  });
});
