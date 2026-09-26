import type { UserRole } from "@/lib/roles";
import { filterEmployeesForPicker } from "@/lib/employee-picker";

export type ManageableUserRecord = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
};

export type UserRoleFilter = "all" | UserRole;

export const USER_DIRECTORY_PAGE_SIZE = 25;

export const USER_MANAGEMENT_TOAST = {
  updated: "User updated.",
  ownershipTransferred: "Ownership transferred.",
} as const;

export const USER_MANAGEMENT_SUCCESS_TOAST_DURATION_MS = 4500;

export function displayUserName(user: ManageableUserRecord): string {
  return user.full_name?.trim() || "Unnamed employee";
}

export function filterManageableUsers(
  users: ManageableUserRecord[],
  search: string,
  roleFilter: UserRoleFilter,
): ManageableUserRecord[] {
  const query = search.trim();
  let filtered = users;

  if (roleFilter !== "all") {
    filtered = filtered.filter((user) => user.role === roleFilter);
  }

  if (query.length === 0) {
    return filtered;
  }

  const matchedIds = new Set(
    filterEmployeesForPicker(
      filtered.map((user) => ({
        id: user.id,
        name: displayUserName(user),
        email: user.email,
      })),
      query,
    ).map((option) => option.id),
  );

  return filtered.filter((user) => matchedIds.has(user.id));
}

export function paginateUsers<T>(
  users: T[],
  page: number,
  pageSize: number,
): { page: number; totalPages: number; slice: T[] } {
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    totalPages,
    slice: users.slice(start, start + pageSize),
  };
}

export function mergeManageableUser(
  users: ManageableUserRecord[],
  updated: ManageableUserRecord,
): ManageableUserRecord[] {
  return users.map((user) => (user.id === updated.id ? updated : user));
}

export function applyOwnershipTransfer(
  users: ManageableUserRecord[],
  previousOwnerId: string,
  newOwnerId: string,
): ManageableUserRecord[] {
  return users.map((user) => {
    if (user.id === previousOwnerId) {
      return { ...user, role: "admin" };
    }

    if (user.id === newOwnerId) {
      return { ...user, role: "owner" };
    }

    return user;
  });
}

export function userDirectoryCountLabel(
  filteredCount: number,
  totalCount: number,
  hasActiveFilters: boolean,
): string {
  if (!hasActiveFilters) {
    return `${totalCount} user${totalCount === 1 ? "" : "s"}`;
  }

  return `${filteredCount} of ${totalCount} user${totalCount === 1 ? "" : "s"}`;
}
