import { requireAccountsOperationalRead } from "@/lib/auth";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";
import { isSupportReadOnlyActor } from "@/lib/support-mode";
import { createClient } from "@/lib/supabase/server";
import { EmployeeIdManagementWorkspace } from "@/components/admin/employee-id-management-workspace";
import { PageHeader } from "@/components/ui/page-header";
import {
  STAFF_DIRECTORY_PAGE_SIZE,
  type EmployeeIdDirectoryRow,
} from "@/lib/staff-directory-presentation";

function mapEmployeeIdRow(raw: Record<string, unknown>): EmployeeIdDirectoryRow {
  return {
    profile_id: String(raw.profile_id),
    full_name: (raw.full_name as string | null) ?? null,
    email: String(raw.email),
    employee_id: (raw.employee_id as string | null) ?? null,
    total_count: Number(raw.total_count ?? 0),
  };
}

export default async function EmployeeIdsPage() {
  const profile = await requireAccountsOperationalRead();
  const supportSession = await fetchActiveSupportSession();
  const supportReadOnly = isSupportReadOnlyActor(profile.role, supportSession);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_employee_id_directory", {
    p_search: null,
    p_limit: STAFF_DIRECTORY_PAGE_SIZE,
    p_offset: 0,
  });

  if (error) {
    throw new Error("Unable to load Employee IDs.");
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapEmployeeIdRow);
  const totalCount = rows[0]?.total_count ?? 0;

  return (
    <>
      <PageHeader
        title="Employee IDs"
        description="Search and assign confidential four-digit Employee IDs for payroll export."
      />
      <EmployeeIdManagementWorkspace
        initialRows={rows}
        initialTotalCount={totalCount}
        readOnly={supportReadOnly}
      />
    </>
  );
}
