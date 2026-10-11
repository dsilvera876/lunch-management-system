import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ROLE_MUTATION_SUPPORT_MODE_MESSAGES,
  classifyManageableUserUpdateError,
  classifyOwnershipTransferError,
  isSupportModeMutationErrorMessage,
  manageableUserRequestedRole,
  manageableUserRoleChanges,
} from "./role-mutation-errors";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function functionBody(source: string, name: string): string {
  const normalized = source.replace(/\r\n/g, "\n");
  const start = normalized.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = normalized.indexOf("\n}\n", start);
  return normalized.slice(start, end === -1 ? undefined : end);
}

describe("role mutation error classification", () => {
  it("detects database Support Mode rejections", () => {
    assert.equal(
      isSupportModeMutationErrorMessage("Role management is unavailable in Support Mode"),
      true,
    );
    assert.equal(
      isSupportModeMutationErrorMessage("Ownership transfer is unavailable in Support Mode"),
      true,
    );
    assert.equal(isSupportModeMutationErrorMessage("Role management access required"), false);
    assert.equal(isSupportModeMutationErrorMessage(null), false);
  });

  it("classifies combined profile and role update failures", () => {
    assert.equal(
      classifyManageableUserUpdateError("Role management is unavailable in Support Mode", true),
      "support_mode",
    );
    assert.equal(classifyManageableUserUpdateError("Profile does not exist", true), "invalid");
    assert.equal(classifyManageableUserUpdateError("Invalid assignable role", true), "assign");
    assert.equal(
      classifyManageableUserUpdateError("Owner role cannot be changed through role assignment", false),
      "assign",
    );
    assert.equal(classifyManageableUserUpdateError("network failure", true), "assign");
    assert.equal(classifyManageableUserUpdateError("network failure", false), "profile");
  });

  it("classifies ownership transfer failures", () => {
    assert.equal(
      classifyOwnershipTransferError("Ownership transfer is unavailable in Support Mode"),
      "support_mode",
    );
    assert.equal(
      classifyOwnershipTransferError("Only the current Owner may transfer ownership"),
      "unauthorized",
    );
    assert.equal(classifyOwnershipTransferError("Target profile does not exist"), "transfer");
  });

  it("keeps Owner targets name-only and detects real role changes", () => {
    assert.equal(manageableUserRequestedRole("owner", "owner"), null);
    assert.equal(manageableUserRequestedRole("owner", "admin"), null);
    assert.equal(manageableUserRequestedRole("staff", "hr"), "hr");
    assert.equal(manageableUserRoleChanges("owner", "admin"), false);
    assert.equal(manageableUserRoleChanges("staff", "staff"), false);
    assert.equal(manageableUserRoleChanges("staff", "hr"), true);
  });

  it("uses clear Support Mode messages that say nothing was saved or how to proceed", () => {
    assert.match(ROLE_MUTATION_SUPPORT_MODE_MESSAGES.roleChange, /Support Mode/);
    assert.match(ROLE_MUTATION_SUPPORT_MODE_MESSAGES.roleChange, /No changes were saved/);
    assert.match(ROLE_MUTATION_SUPPORT_MODE_MESSAGES.ownershipTransfer, /End Support Mode/);
  });
});

describe("role mutation Support Mode and atomic update wiring", () => {
  const actions = readSource("../app/admin/users/actions.ts");
  const auth = readSource("./auth.ts");

  it("rejects role changes in Support Mode before any write", () => {
    const body = functionBody(actions, "updateManageableUserInline");
    const guard = body.indexOf("isRoleMutationBlockedBySupportMode()");
    const write = body.indexOf('supabase.rpc("update_manageable_user"');

    assert.ok(guard >= 0, "Support Mode guard missing");
    assert.ok(write > guard, "Support Mode guard must run before the update RPC");
    assert.match(body, /roleChanged && \(await isRoleMutationBlockedBySupportMode\(\)\)/);
    assert.match(body, /error: "support_mode"/);
  });

  it("saves name and role through one atomic RPC instead of sequential calls", () => {
    const body = functionBody(actions, "updateManageableUserInline");

    assert.match(body, /supabase\.rpc\("update_manageable_user", \{/);
    assert.match(body, /p_role: roleChanged \? requestedRole : null/);
    assert.doesNotMatch(body, /update_manageable_user_profile/);
    assert.doesNotMatch(body, /assign_user_role/);
  });

  it("rejects ownership transfer in Support Mode before the RPC", () => {
    const body = functionBody(actions, "transferOwnershipInline");
    const guard = body.indexOf("isRoleMutationBlockedBySupportMode()");
    const rpc = body.indexOf('supabase.rpc("transfer_ownership"');

    assert.match(body, /requireOwner\(\)/);
    assert.ok(guard >= 0 && rpc > guard, "Support Mode guard must run before transfer_ownership");
    assert.match(body, /classifyOwnershipTransferError/);
  });

  it("guards the form-based role and ownership actions", () => {
    const assignBody = functionBody(actions, "assignUserRole");
    const transferBody = functionBody(actions, "transferOwnership");

    assert.ok(
      assignBody.indexOf("isRoleMutationBlockedBySupportMode()") <
        assignBody.indexOf('supabase.rpc("assign_user_role"'),
    );
    assert.match(assignBody, /error=support-mode/);
    assert.match(transferBody, /transferOwnershipInline/);
    assert.match(transferBody, /error=support-mode/);
  });

  it("keeps requireManageRoles and requireOwner usable for read-only Support Mode access", () => {
    assert.doesNotMatch(functionBody(auth, "requireManageRoles"), /SupportScope|support/i);
    assert.doesNotMatch(functionBody(auth, "requireOwner"), /SupportScope|support/i);
    assert.doesNotMatch(
      functionBody(actions, "getUserDeletionEligibilityInline"),
      /isRoleMutationBlockedBySupportMode/,
    );
  });

  it("shows Support Mode messages in the edit drawer and ownership card", () => {
    const drawer = readSource("../components/admin/edit-user-drawer.tsx");
    const ownership = readSource("../components/admin/system-ownership-card.tsx");

    assert.match(drawer, /case "support_mode":\s*\n\s*return ROLE_MUTATION_SUPPORT_MODE_MESSAGES\.roleChange/);
    assert.match(
      ownership,
      /case "support_mode":\s*\n\s*return ROLE_MUTATION_SUPPORT_MODE_MESSAGES\.ownershipTransfer/,
    );
  });
});
