"use server";

import { revalidatePath } from "next/cache";
import { requireManageStaffAccounts } from "@/lib/auth";
import { mapSetEmployeeIdError, validateEmployeeIdField } from "@/lib/employee-id";
import { createClient } from "@/lib/supabase/server";
import type {
  AccountStatusFilter,
  StaffDirectoryRow,
  StaffRoleFilter,
} from "@/lib/staff-directory-presentation";

export type SearchStaffDirectoryResult =
  | { success: true; rows: StaffDirectoryRow[]; totalCount: number }
  | { success: false; error: "search" | "unauthorized" };

export type MutateStaffResult =
  | { success: true; row: StaffDirectoryRow }
  | { success: false; error: string };

function mapDirectoryRow(raw: Record<string, unknown>): StaffDirectoryRow {
  return {
    profile_id: String(raw.profile_id),
    full_name: (raw.full_name as string | null) ?? null,
    email: String(raw.email),
    employee_id: (raw.employee_id as string | null) ?? null,
    role: raw.role as StaffDirectoryRow["role"],
    status: raw.status as StaffDirectoryRow["status"],
    total_count: Number(raw.total_count ?? 0),
  };
}

export async function searchStaffDirectory(input: {
  search: string;
  status: AccountStatusFilter;
  role: StaffRoleFilter;
  page: number;
  pageSize: number;
}): Promise<SearchStaffDirectoryResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();
  const offset = Math.max(0, (input.page - 1) * input.pageSize);

  const { data, error } = await supabase.rpc("search_staff_directory", {
    p_search: input.search.trim().length > 0 ? input.search.trim() : null,
    p_status: input.status === "all" ? null : input.status,
    p_role: input.role === "all" ? null : input.role,
    p_limit: input.pageSize,
    p_offset: offset,
  });

  if (error || !data) {
    return { success: false, error: "search" };
  }

  const rows = (data as Record<string, unknown>[]).map(mapDirectoryRow);
  const totalCount = rows[0]?.total_count ?? 0;

  return { success: true, rows, totalCount };
}

async function reloadStaffRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<StaffDirectoryRow | null> {
  const { data, error } = await supabase.rpc("search_staff_directory", {
    p_search: null,
    p_status: null,
    p_role: null,
    p_limit: 500,
    p_offset: 0,
  });

  if (error || !data) {
    return null;
  }

  const row = (data as Record<string, unknown>[]).find(
    (entry) => String(entry.profile_id) === profileId,
  );

  return row ? mapDirectoryRow(row) : null;
}

export async function updateStaffNameInline(input: {
  profileId: string;
  fullName: string;
}): Promise<MutateStaffResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_staff_name", {
    p_profile_id: input.profileId,
    p_full_name: input.fullName,
  });

  if (error) {
    return { success: false, error: "Unable to update name. Please try again." };
  }

  revalidatePath("/admin/users");
  const row = await reloadStaffRow(supabase, input.profileId);

  return row
    ? { success: true, row }
    : { success: false, error: "Unable to refresh user record." };
}

export async function setStaffEmployeeIdInline(input: {
  profileId: string;
  employeeId: string;
}): Promise<MutateStaffResult> {
  await requireManageStaffAccounts();

  const validated = validateEmployeeIdField(input.employeeId);
  if (!validated.ok) {
    return { success: false, error: validated.message };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_employee_id", {
    p_profile_id: input.profileId,
    p_employee_id: validated.value,
  });

  if (error) {
    return { success: false, error: mapSetEmployeeIdError(error.message) };
  }

  revalidatePath("/admin/users");
  const row = await reloadStaffRow(supabase, input.profileId);

  return row
    ? { success: true, row }
    : { success: false, error: "Unable to refresh user record." };
}

export async function setStaffActiveStatusInline(input: {
  profileId: string;
  status: "active" | "inactive";
}): Promise<MutateStaffResult> {
  await requireManageStaffAccounts();

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_staff_active_status", {
    p_profile_id: input.profileId,
    p_status: input.status,
  });

  if (error) {
    if (error.message.includes("Owner accounts cannot be deactivated")) {
      return {
        success: false,
        error: "Owner accounts cannot be deactivated.",
      };
    }

    if (error.message.includes("cannot deactivate your own account")) {
      return {
        success: false,
        error: "You cannot deactivate your own account.",
      };
    }

    return { success: false, error: "Unable to update account status." };
  }

  revalidatePath("/admin/users");
  const row = await reloadStaffRow(supabase, input.profileId);

  return row
    ? { success: true, row }
    : { success: false, error: "Unable to refresh user record." };
}
