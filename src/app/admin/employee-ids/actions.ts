"use server";

import { revalidatePath } from "next/cache";
import {
  requireAccountsEmployeeIdDirectoryRead,
  requireMutateEmployeeIds,
} from "@/lib/auth";
import { mapSetEmployeeIdError, validateEmployeeIdField } from "@/lib/employee-id";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeIdDirectoryRow } from "@/lib/staff-directory-presentation";
export type SearchEmployeeIdDirectoryResult =
  | { success: true; rows: EmployeeIdDirectoryRow[]; totalCount: number }
  | { success: false; error: "search" };

export type MutateEmployeeIdResult =
  | { success: true; row: EmployeeIdDirectoryRow }
  | { success: false; error: string };

function mapDirectoryRow(raw: Record<string, unknown>): EmployeeIdDirectoryRow {
  return {
    profile_id: String(raw.profile_id),
    full_name: (raw.full_name as string | null) ?? null,
    email: String(raw.email),
    employee_id: (raw.employee_id as string | null) ?? null,
    total_count: Number(raw.total_count ?? 0),
  };
}

export async function searchEmployeeIdDirectory(input: {
  search: string;
  page: number;
  pageSize: number;
}): Promise<SearchEmployeeIdDirectoryResult> {
  await requireAccountsEmployeeIdDirectoryRead();

  const supabase = await createClient();
  const offset = Math.max(0, (input.page - 1) * input.pageSize);

  const { data, error } = await supabase.rpc("search_employee_id_directory", {
    p_search: input.search.trim().length > 0 ? input.search.trim() : null,
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

async function reloadEmployeeIdRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<EmployeeIdDirectoryRow | null> {
  const { data, error } = await supabase.rpc("search_employee_id_directory", {
    p_search: null,
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

export async function setEmployeeIdInline(input: {
  profileId: string;
  employeeId: string;
}): Promise<MutateEmployeeIdResult> {
  await requireMutateEmployeeIds();

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

  revalidatePath("/admin/employee-ids");
  const row = await reloadEmployeeIdRow(supabase, input.profileId);

  return row
    ? { success: true, row }
    : { success: false, error: "Unable to refresh employee record." };
}
