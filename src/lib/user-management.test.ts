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

    assert.match(page, /canTransferOwnership=\{isOwner\(adminProfile\.role\)\}/);
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
    assert.equal(crumbs[2]?.label, "Users");
    assert.equal(crumbs[2]?.href, undefined);
    assert.ok(!crumbs.some((crumb) => crumb.href === "/admin"));
  });

  it("wires HR users workspace with Employee ID column and lifecycle RPCs", () => {
    const hrWorkspace = readFileSync(
      new URL("../components/admin/hr-users-workspace.tsx", import.meta.url),
      "utf8",
    );
    const hrDrawer = readFileSync(
      new URL("../components/admin/hr-user-details-drawer.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /HrUsersWorkspace/);
    assert.match(page, /search_staff_directory/);
    assert.match(hrWorkspace, /Employee ID/);
    assert.match(hrWorkspace, /data-testid="hr-users-table"/);
    assert.match(hrDrawer, /updateStaffNameInline/);
    assert.match(hrDrawer, /setStaffEmployeeIdInline/);
    assert.match(hrDrawer, /Role is view-only for HR/);
    assert.match(hrDrawer, /Deactivate user/);
  });

  it("exposes bulk import as a secondary HR-only action", () => {
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );
    const importPage = readFileSync(
      new URL("../app/admin/users/import/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/hr-bulk-import-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /More actions/);
    assert.match(page, /Bulk import users/);
    assert.match(page, /\/admin\/users\/import/);
    assert.doesNotMatch(page, /Bulk import[\s\S]*disabled/);
    assert.match(importPage, /profile\.role !== "hr"/);
    assert.match(workspace, /ImportStepIndicator/);
    assert.match(workspace, /data-step-state=\{/);
    assert.match(workspace, /\? "active" : isComplete \? "completed" : "upcoming"/);
    assert.match(workspace, /bg-teal-100 text-teal-800 ring-teal-400/);
    assert.match(workspace, /bg-white text-slate-600 ring-slate-300/);
    assert.match(workspace, /max-w-6xl/);
    assert.match(workspace, /data-testid="bulk-import-workflow"/);
    assert.match(workspace, /Before you upload/);
    assert.match(workspace, /The CSV should use these columns:/);
    assert.match(
      workspace,
      /Before you upload[\s\S]*full_name[\s\S]*email[\s\S]*employee_id/,
    );
    assert.doesNotMatch(workspace, /CSV columns:/);
    assert.match(workspace, /employee_id/);
    assert.match(workspace, /Choose CSV file/);
    assert.match(workspace, /className="sr-only"/);
    assert.match(workspace, /data-testid="bulk-import-upload-error"/);
    assert.match(workspace, /uploadErrorRef/);
    assert.match(workspace, /scrollIntoView/);
    assert.match(workspace, /data-testid="bulk-import-validate-action"/);
    assert.match(workspace, /flex justify-end/);
    assert.match(workspace, /Validate CSV/);
    assert.match(workspace, /Validating…/);
    assert.match(workspace, /IconArrowRight/);
    assert.match(workspace, /Remove file/);
    assert.match(workspace, /IconCircleX/);
    assert.match(workspace, /aria-label="Remove file"/);
    assert.match(workspace, /disabled=\{isPending \|\| !selectedFile\}/);
    assert.match(workspace, /disabled=\{isPending\}/);
    assert.match(workspace, /Confirm Import/);
    assert.match(workspace, /Download CSV template/);
    assert.match(workspace, /Upload another file/);
    assert.match(workspace, /ClassificationChip/);
    assert.doesNotMatch(workspace, /validateStaffEmployeeId/);
    assert.match(
      workspace,
      /ClassificationChip classification=\{classification\}/,
    );
    assert.doesNotMatch(
      workspace,
      /employee_id[\s\S]{0,200}Employee ID must be exactly four digits/,
    );
    assert.match(workspace, /role="progressbar"/);
    assert.match(workspace, /disabled=\{!canConfirm\}/);
    assert.match(workspace, /The CSV should use these columns:/);
    assert.match(workspace, /data-testid="bulk-import-review-table"/);
    assert.match(workspace, /data-testid="bulk-import-results-table"/);
    assert.match(workspace, />Row</);
    assert.match(workspace, /Planned action/);
    assert.doesNotMatch(workspace, /Row \{String\(row\.row_number\)\}/);
    assert.doesNotMatch(workspace, /employee_id_import_note/);
    assert.match(workspace, /sanitizeUserImportResultMessage/);
    assert.doesNotMatch(workspace, /APP_ORIGIN/);
    assert.match(workspace, /row\.employee_id \? String\(row\.employee_id\)/);
    assert.match(
      workspace,
      /overflow-x-auto[\s\S]{0,120}data-testid="bulk-import-review-table"/,
    );
    assert.match(
      workspace,
      /overflow-x-auto[\s\S]{0,120}data-testid="bulk-import-results-table"/,
    );
    assert.match(workspace, /data-testid="bulk-import-review-actions"/);
    assert.match(workspace, /data-testid="bulk-import-results-actions"/);
    assert.match(
      workspace,
      /flex flex-wrap justify-end gap-2 border-t border-border pt-4"\s*\n\s*data-testid="bulk-import-review-actions"/,
    );
    assert.match(
      workspace,
      /flex flex-wrap justify-end gap-2 border-t border-border pt-4"\s*\n\s*data-testid="bulk-import-results-actions"/,
    );
  });

  it("uses Bulk Import breadcrumbs under Users", () => {
    const crumbs = getBreadcrumbs("/admin/users/import");

    assert.equal(crumbs[2]?.label, "Users");
    assert.equal(crumbs[2]?.href, "/admin/users");
    assert.equal(crumbs[3]?.label, "Bulk Import");
  });

  it("enables HR pending approvals entry point with count and approvals view", () => {
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );
    const signupWorkspace = readFileSync(
      new URL("../components/admin/hr-signup-requests-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /Pending approvals/);
    assert.match(page, /aria-label=\{[\s\S]*request.*pending/);
    assert.match(page, /bg-red-600/);
    assert.match(page, /variant=\{pendingCount > 0 \? "primary" : "secondary"\}/);
    assert.doesNotMatch(page, /Pending approvals[\s\S]*disabled/);
    assert.match(page, /count_pending_signup_requests/);
    assert.match(page, /view=approvals/);
    assert.match(page, /HrSignupRequestsWorkspace/);
    assert.match(signupWorkspace, /Retry invitation/);
  });

  it("blocks double-submit and shows approving progress in the signup drawer", () => {
    const drawer = readFileSync(
      new URL("../components/admin/hr-signup-request-drawer.tsx", import.meta.url),
      "utf8",
    );
    const signupWorkspace = readFileSync(
      new URL("../components/admin/hr-signup-requests-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /disabled=\{isPending\}/);
    assert.match(drawer, /Approving…/);
    assert.match(drawer, /resolveSignupDrawerActionOutcome/);
    assert.match(drawer, /resetAndClose\(\);\s*\n\s*onUpdated\(\)/);
    assert.match(drawer, /Cancel request/);
    assert.match(signupWorkspace, /cancelled/);
  });

  it("does not expose signup approval controls on Admin role-management page", () => {
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );

    const adminBranch = page.split("if (!canManageRoles(profile.role))")[1] ?? "";

    assert.match(page, /UserManagementWorkspace/);
    assert.match(page, /canManageStaffAccounts\(profile\.role\)/);
    assert.doesNotMatch(adminBranch, /Pending approvals/);
    assert.doesNotMatch(adminBranch, /HrSignupRequestsWorkspace/);
  });

  it("wires Accounts Employee ID management without HR lifecycle controls", () => {
    const workspace = readFileSync(
      new URL("../components/admin/employee-id-management-workspace.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/employee-ids/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /search_employee_id_directory/);
    assert.match(workspace, /data-testid="employee-id-management-table"/);
    assert.doesNotMatch(workspace, /Deactivate user/);
    assert.doesNotMatch(workspace, /updateStaffNameInline/);
  });
});
