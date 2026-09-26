import { requireManageRoles } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { UserManagementWorkspace } from "@/components/admin/user-management-workspace";
import { PageHeader } from "@/components/ui/page-header";
import type { ManageableUserRecord } from "@/lib/user-management-presentation";
import type { UserRole } from "@/lib/roles";

export default async function UserManagementPage() {
  const profile = await requireManageRoles();
  const supabase = await createClient();

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
        viewerRole={profile.role}
        viewerId={profile.id}
        canTransferOwnership={isOwner(profile.role)}
      />
    </>
  );
}
