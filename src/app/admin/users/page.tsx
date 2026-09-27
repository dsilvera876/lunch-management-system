import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  requireManageRoles,
} from "@/lib/auth";
import { canManageRoles, canManageStaffAccounts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { UserManagementWorkspace } from "@/components/admin/user-management-workspace";
import { HrUsersWorkspace } from "@/components/admin/hr-users-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type { ManageableUserRecord } from "@/lib/user-management-presentation";
import type { StaffDirectoryRow } from "@/lib/staff-directory-presentation";
import type { UserRole } from "@/lib/roles";
import { isOwner } from "@/lib/roles";
import { STAFF_DIRECTORY_PAGE_SIZE } from "@/lib/staff-directory-presentation";

function mapStaffDirectoryRow(raw: Record<string, unknown>): StaffDirectoryRow {
  return {
    profile_id: String(raw.profile_id),
    full_name: (raw.full_name as string | null) ?? null,
    email: String(raw.email),
    employee_id: (raw.employee_id as string | null) ?? null,
    role: raw.role as UserRole,
    status: raw.status as StaffDirectoryRow["status"],
    total_count: Number(raw.total_count ?? 0),
  };
}

function HrUsersHeaderActions() {
  return (
    <>
      <Button type="button" variant="secondary" disabled title="Coming in a future release">
        Bulk import
      </Button>
      <Button type="button" variant="primary" disabled title="Coming in a future release">
        Pending approvals
      </Button>
    </>
  );
}

export default async function UserManagementPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (canManageStaffAccounts(profile.role)) {
    const { data, error } = await supabase.rpc("search_staff_directory", {
      p_search: null,
      p_status: null,
      p_role: null,
      p_limit: STAFF_DIRECTORY_PAGE_SIZE,
      p_offset: 0,
    });

    if (error) {
      throw new Error("Unable to load users.");
    }

    const rows = ((data ?? []) as Record<string, unknown>[]).map(mapStaffDirectoryRow);
    const totalCount = rows[0]?.total_count ?? 0;

    return (
      <>
        <PageHeader
          title="Users"
          description="Manage staff access, approvals, and employee records."
          actions={<HrUsersHeaderActions />}
        />
        <HrUsersWorkspace initialRows={rows} initialTotalCount={totalCount} />
      </>
    );
  }

  if (!canManageRoles(profile.role)) {
    redirect("/account");
  }

  const adminProfile = await requireManageRoles();

  const { data: users, error } = await supabase.rpc("list_manageable_users");

  if (error) {
    throw new Error("Unable to load users.");
  }

  const rows = (users ?? []) as ManageableUserRecord[];
  const normalizedUsers: ManageableUserRecord[] = rows.map((user) => ({
    ...user,
    role: user.role as UserRole,
  }));

  return (
    <>
      <PageHeader
        title="User Management"
        description="Manage employee details, roles, and system ownership."
      />
      <UserManagementWorkspace
        initialUsers={normalizedUsers}
        viewerRole={adminProfile.role}
        viewerId={adminProfile.id}
        canTransferOwnership={isOwner(adminProfile.role)}
      />
    </>
  );
}
