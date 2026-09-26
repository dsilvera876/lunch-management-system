import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getBreadcrumbs } from "./breadcrumbs";
import {
  USER_DIRECTORY_PAGE_SIZE,
  applyOwnershipTransfer,
  displayUserName,
  filterManageableUsers,
  paginateUsers,
  type ManageableUserRecord,
} from "./user-management-presentation";

const sampleUsers: ManageableUserRecord[] = [
  {
    id: "1",
    full_name: "Alex Carter",
    email: "alex.carter@lunch.test",
    role: "hr",
  },
  {
    id: "2",
    full_name: "Dev Owner",
    email: "owner@lunch.test",
    role: "owner",
  },
  {
    id: "3",
    full_name: "Sam Staff",
    email: "sam@lunch.test",
    role: "staff",
  },
];

describe("user management presentation", () => {
  it("filters users by name and email", () => {
    assert.equal(
      filterManageableUsers(sampleUsers, "alex", "all").length,
      1,
    );
    assert.equal(
      filterManageableUsers(sampleUsers, "owner@lunch", "all").length,
      1,
    );
    assert.equal(
      filterManageableUsers(sampleUsers, "", "staff").length,
      1,
    );
  });

  it("paginates filtered results", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      full_name: `User ${index}`,
      email: `user${index}@lunch.test`,
      role: "staff" as const,
    }));

    const filtered = filterManageableUsers(many, "", "all");
    const page = paginateUsers(filtered, 2, USER_DIRECTORY_PAGE_SIZE);

    assert.equal(page.page, 2);
    assert.equal(page.totalPages, 2);
    assert.equal(page.slice.length, 5);
  });

  it("patches roles after ownership transfer", () => {
    const next = applyOwnershipTransfer(sampleUsers, "2", "1");

    assert.equal(next.find((user) => user.id === "2")?.role, "admin");
    assert.equal(next.find((user) => user.id === "1")?.role, "owner");
  });

  it("formats display names", () => {
    assert.equal(displayUserName({ ...sampleUsers[0]!, full_name: null }), "Unnamed employee");
  });
});

describe("user management workspace wiring", () => {
  it("uses compact directory table and edit drawer", () => {
    const workspace = readFileSync(
      new URL("../components/admin/user-management-workspace.tsx", import.meta.url),
      "utf8",
    );
    const drawer = readFileSync(
      new URL("../components/admin/edit-user-drawer.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /<table/);
    assert.match(workspace, /Edit user/);
    assert.match(workspace, /IconPencil/);
    assert.match(drawer, /Edit user/);
    assert.match(drawer, /readOnly/);
    assert.doesNotMatch(drawer, /name="email"/);
    assert.match(drawer, /updateManageableUserInline/);
    assert.match(page, /User Management/);
    assert.doesNotMatch(page, /Alert variant="success"/);
  });

  it("locks Owner role and keeps name editable", () => {
    const drawer = readFileSync(
      new URL("../components/admin/edit-user-drawer.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /Owner role is changed through ownership transfer/);
    assert.match(drawer, /ASSIGNABLE_ROLES/);
    assert.match(drawer, /fullName/);
  });

  it("wires ownership transfer button with confirmation before RPC", () => {
    const ownership = readFileSync(
      new URL("../components/admin/system-ownership-card.tsx", import.meta.url),
      "utf8",
    );

    assert.match(ownership, /TransferOwnershipSubmitButton/);
    assert.match(ownership, /data-testid="transfer-ownership-button"/);
    assert.match(ownership, /window\.confirm/);
    assert.match(ownership, /transferOwnershipInline/);
    assert.doesNotMatch(ownership, /onValueChange=\{setNewOwnerId\}/);
    assert.match(ownership, /buildOwnershipTransferConfirmMessage/);
  });

  it("uses compact directory toolbar widths for search and role filter", () => {
    const workspace = readFileSync(
      new URL("../components/admin/user-management-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /user-directory-search/);
    assert.match(workspace, /md:w-\[24rem\]/);
    assert.match(workspace, /lg:w-\[28rem\]/);
    assert.match(workspace, /user-directory-role/);
    assert.match(workspace, /userDirectoryCountLabel/);
  });

  it("shows ownership section only for owners server-side and client-side", () => {
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/user-management-workspace.tsx", import.meta.url),
      "utf8",
    );
    const ownership = readFileSync(
      new URL("../components/admin/system-ownership-card.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/users/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(page, /canTransferOwnership=\{isOwner\(profile\.role\)\}/);
    assert.match(workspace, /canTransferOwnership \?/);
    assert.match(ownership, /EmployeePicker/);
    assert.match(ownership, /transferOwnershipInline/);
    assert.match(ownership, /window\.confirm/);
    assert.match(actions, /requireOwner\(\)/);
  });

  it("uses User Management breadcrumb without linking Administration to /admin", () => {
    const crumbs = getBreadcrumbs("/admin/users");

    assert.equal(crumbs[0]?.label, "Home");
    assert.equal(crumbs[0]?.href, "/home");
    assert.equal(crumbs[1]?.label, "Administration");
    assert.equal(crumbs[1]?.href, undefined);
    assert.equal(crumbs[2]?.label, "User Management");
    assert.equal(crumbs[2]?.href, undefined);
    assert.ok(!crumbs.some((crumb) => crumb.href === "/admin"));
  });
});
