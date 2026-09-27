import type { UserRole } from "@/lib/roles";

export const STAFF_DIRECTORY_PAGE_SIZE = 25;

export type AccountStatusFilter = "all" | "active" | "inactive";
export type StaffRoleFilter = "all" | UserRole;

export type StaffDirectoryRow = {
  profile_id: string;
  full_name: string | null;
  email: string;
  employee_id: string | null;
  role: UserRole;
  status: "active" | "inactive";
  total_count: number;
};

export type EmployeeIdDirectoryRow = {
  profile_id: string;
  full_name: string | null;
  email: string;
  employee_id: string | null;
  total_count: number;
};

export function staffDirectoryCountLabel(
  visibleCount: number,
  totalCount: number,
): string {
  if (totalCount === 0) {
    return "No users found";
  }

  return `Showing ${visibleCount} of ${totalCount} users`;
}

export function employeeIdDirectoryCountLabel(
  visibleCount: number,
  totalCount: number,
): string {
  if (totalCount === 0) {
    return "No employees found";
  }

  return `Showing ${visibleCount} of ${totalCount} employees`;
}

export function displayStaffName(row: {
  full_name: string | null;
  email: string;
}): string {
  return row.full_name?.trim() || row.email;
}

export function mergeStaffDirectoryRow(
  rows: StaffDirectoryRow[],
  updated: StaffDirectoryRow,
): StaffDirectoryRow[] {
  return rows.map((row) =>
    row.profile_id === updated.profile_id ? { ...updated, total_count: row.total_count } : row,
  );
}

export function mergeEmployeeIdDirectoryRow(
  rows: EmployeeIdDirectoryRow[],
  updated: EmployeeIdDirectoryRow,
): EmployeeIdDirectoryRow[] {
  return rows.map((row) =>
    row.profile_id === updated.profile_id
      ? { ...updated, total_count: row.total_count }
      : row,
  );
}
