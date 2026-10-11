export type ManageableUserUpdateError = "invalid" | "assign" | "profile" | "support_mode";

export type OwnershipTransferError = "invalid" | "transfer" | "unauthorized" | "support_mode";

export const ROLE_MUTATION_SUPPORT_MODE_MESSAGES = {
  roleChange:
    "Role changes are unavailable in Support Mode. End Support Mode to change this user's role. No changes were saved.",
  ownershipTransfer:
    "Ownership transfer is unavailable in Support Mode. End Support Mode to transfer ownership.",
} as const;

const ASSIGN_ERROR_FRAGMENTS = [
  "Invalid assignable role",
  "Owner role cannot be changed",
  "Owner cannot change their own role",
  "Owner role can only change through ownership transfer",
] as const;

export function isSupportModeMutationErrorMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes("unavailable in Support Mode");
}

/**
 * Role sent to update_manageable_user: null for Owner targets (name-only edit;
 * Owner role changes only through ownership transfer).
 */
export function manageableUserRequestedRole(
  existingRole: string,
  requestedRole: string,
): string | null {
  return existingRole === "owner" ? null : requestedRole;
}

export function manageableUserRoleChanges(existingRole: string, requestedRole: string): boolean {
  const role = manageableUserRequestedRole(existingRole, requestedRole);
  return role !== null && role !== existingRole;
}

export function classifyManageableUserUpdateError(
  message: string | null | undefined,
  roleChanged: boolean,
): ManageableUserUpdateError {
  const text = message ?? "";

  if (isSupportModeMutationErrorMessage(text)) {
    return "support_mode";
  }

  if (text.includes("Profile does not exist")) {
    return "invalid";
  }

  if (ASSIGN_ERROR_FRAGMENTS.some((fragment) => text.includes(fragment))) {
    return "assign";
  }

  return roleChanged ? "assign" : "profile";
}

export function classifyOwnershipTransferError(
  message: string | null | undefined,
): OwnershipTransferError {
  const text = message ?? "";

  if (isSupportModeMutationErrorMessage(text)) {
    return "support_mode";
  }

  if (text.includes("Only the current Owner")) {
    return "unauthorized";
  }

  return "transfer";
}
