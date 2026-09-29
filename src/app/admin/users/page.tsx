import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  requireManageRoles,
} from "@/lib/auth";
import { canManageRoles, canManageStaffAccounts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { UserManagementWorkspace } from "@/components/admin/user-management-workspace";
import { HrUsersWorkspace } from "@/components/admin/hr-users-workspace";
import { HrSignupRequestsWorkspace } from "@/components/admin/hr-signup-requests-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type { ManageableUserRecord } from "@/lib/user-management-presentation";
import type { StaffDirectoryRow } from "@/lib/staff-directory-presentation";
import type { SignupRequestRow } from "@/lib/signup-request-presentation";
import type { UserRole } from "@/lib/roles";
import { isOwner } from "@/lib/roles";
import { STAFF_DIRECTORY_PAGE_SIZE } from "@/lib/staff-directory-presentation";
import { SIGNUP_REQUEST_PAGE_SIZE } from "@/lib/signup-request-presentation";

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

function mapSignupRequestRow(raw: Record<string, unknown>): SignupRequestRow {
  return {
    request_id: String(raw.request_id),
    full_name: String(raw.full_name),
    email: String(raw.email),
    status: raw.status as SignupRequestRow["status"],
    requested_at: String(raw.requested_at),
    requested_employee_id: (raw.requested_employee_id as string | null) ?? null,
    created_profile_id: (raw.created_profile_id as string | null) ?? null,
    invite_sent_at: (raw.invite_sent_at as string | null) ?? null,
    invite_last_error: (raw.invite_last_error as string | null) ?? null,
    cancelled_at: (raw.cancelled_at as string | null) ?? null,
    cancellation_reason: (raw.cancellation_reason as string | null) ?? null,
    cancellation_note: (raw.cancellation_note as string | null) ?? null,
    onboarding_established: raw.onboarding_established === true,
    total_count: Number(raw.total_count ?? 0),
  };
}

function HrUsersHeaderActions({
  pendingCount,
  showApprovals,
}: {
  pendingCount: number;
  showApprovals: boolean;
}) {
  if (showApprovals) {
    return (
      <Link href="/admin/users">
        <Button type="button" variant="secondary">
          All users
        </Button>
      </Link>
    );
  }

  return (
    <>
      <details className="relative inline-block">
        <summary className="cursor-pointer list-none rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          More actions ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-md border border-border bg-background py-1 shadow-lg">
          <Link
            href="/admin/users/import"
            className="block px-3 py-2 text-sm text-foreground hover:bg-muted/40"
          >
            Bulk import users
          </Link>
        </div>
      </details>
      <Link href="/admin/users?view=approvals">
        <Button
          type="button"
          variant={pendingCount > 0 ? "primary" : "secondary"}
          className={pendingCount > 0 ? "text-white" : undefined}
          aria-label={
            pendingCount > 0
              ? `Pending approvals, ${pendingCount} request${pendingCount === 1 ? "" : "s"} pending`
              : "Pending approvals"
          }
        >
          <span className="inline-flex items-center gap-2.5">
            <span>Pending approvals</span>
            {pendingCount > 0 ? (
              <span
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold leading-none text-white"
                aria-hidden
              >
                {pendingCount}
              </span>
            ) : null}
          </span>
        </Button>
      </Link>
    </>
  );
}

type Props = {
  searchParams: Promise<{
    view?: string;
  }>;
};

export default async function UserManagementPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (canManageStaffAccounts(profile.role)) {
    const showApprovals = params.view === "approvals";

    const { data: pendingCountData } = await supabase.rpc("count_pending_signup_requests");
    const pendingCount = Number(pendingCountData ?? 0);

    if (showApprovals) {
      const { data, error } = await supabase.rpc("search_signup_requests", {
        p_search: null,
        p_status: "pending",
        p_limit: SIGNUP_REQUEST_PAGE_SIZE,
        p_offset: 0,
      });

      if (error) {
        throw new Error("Unable to load signup requests.");
      }

      const rows = ((data ?? []) as Record<string, unknown>[]).map(mapSignupRequestRow);
      const totalCount = rows[0]?.total_count ?? 0;

      return (
        <>
          <PageHeader
            title="Pending approvals"
            description="Review external email signup requests before accounts are created."
            actions={
              <HrUsersHeaderActions pendingCount={pendingCount} showApprovals={showApprovals} />
            }
          />
          <HrSignupRequestsWorkspace
            initialRows={rows}
            initialTotalCount={totalCount}
            initialStatus="pending"
          />
        </>
      );
    }

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
          actions={
            <HrUsersHeaderActions pendingCount={pendingCount} showApprovals={showApprovals} />
          }
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
