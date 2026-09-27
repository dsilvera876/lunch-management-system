"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchStaffDirectory } from "@/app/admin/users/hr-actions";
import { HrUserDetailsDrawer } from "@/components/admin/hr-user-details-drawer";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import { Button, linkButtonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastProvider } from "@/components/ui/toast";
import { formatEmployeeIdDisplay } from "@/lib/employee-id";
import {
  STAFF_DIRECTORY_PAGE_SIZE,
  displayStaffName,
  mergeStaffDirectoryRow,
  staffDirectoryCountLabel,
  type AccountStatusFilter,
  type StaffDirectoryRow,
  type StaffRoleFilter,
} from "@/lib/staff-directory-presentation";
import { USER_ROLES, getRoleLabel } from "@/lib/roles";

type Props = {
  initialRows: StaffDirectoryRow[];
  initialTotalCount: number;
};

const compactManageButtonClass =
  "!min-h-0 h-8 shrink-0 whitespace-nowrap px-2.5 py-0 text-xs leading-none";

function HrUsersWorkspaceContent({ initialRows, initialTotalCount }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const skipInitialFetchRef = useRef(true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(handle);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / STAFF_DIRECTORY_PAGE_SIZE));

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const result = await searchStaffDirectory({
      search: debouncedSearch,
      status: statusFilter,
      role: roleFilter,
      page,
      pageSize: STAFF_DIRECTORY_PAGE_SIZE,
    });

    setLoading(false);

    if (!result.success) {
      setLoadError("Unable to load users.");
      return;
    }

    setRows(result.rows);
    setTotalCount(result.totalCount);
  }, [debouncedSearch, statusFilter, roleFilter, page]);

  useEffect(() => {
    if (
      skipInitialFetchRef.current &&
      debouncedSearch === "" &&
      statusFilter === "all" &&
      roleFilter === "all" &&
      page === 1
    ) {
      skipInitialFetchRef.current = false;
      return;
    }

    skipInitialFetchRef.current = false;
    void fetchDirectory();
  }, [fetchDirectory, debouncedSearch, statusFilter, roleFilter, page]);

  const selectedUser = useMemo(
    () =>
      selectedUserId === null
        ? null
        : (rows.find((row) => row.profile_id === selectedUserId) ?? null),
    [rows, selectedUserId],
  );

  function openDrawer(user: StaffDirectoryRow) {
    setSelectedUserId(user.profile_id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedUserId(null);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-x-3 md:gap-y-3">
        <div className="w-full md:w-[24rem] lg:w-[28rem]">
          <FormField label="Search" htmlFor="hr-users-search">
            <input
              id="hr-users-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or Employee ID"
              className={inputClassName}
            />
          </FormField>
        </div>
        <div className="w-full md:w-[11rem]">
          <FormField label="Status" htmlFor="hr-users-status">
            <select
              id="hr-users-status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as AccountStatusFilter);
                setPage(1);
              }}
              className={selectClassName}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
        </div>
        <div className="w-full md:w-[11rem]">
          <FormField label="Role" htmlFor="hr-users-role">
            <select
              id="hr-users-role"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as StaffRoleFilter);
                setPage(1);
              }}
              className={selectClassName}
            >
              <option value="all">All roles</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <p className="text-sm font-medium text-muted md:ml-auto md:pb-2">
          {loading
            ? "Loading users…"
            : staffDirectoryCountLabel(rows.length, totalCount)}
        </p>
      </div>

      {loadError ? (
        <EmptyState title={loadError} description="Try refreshing the page." />
      ) : !loading && rows.length === 0 ? (
        <EmptyState
          title="No users match your search or filters."
          description=""
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full table-fixed text-left text-sm" data-testid="hr-users-table">
              <thead className="border-b border-border bg-slate-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Employee ID</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Role</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {rows.map((user) => (
                  <tr key={user.profile_id} className="h-[3.25rem]">
                    <td className="px-3 py-2 align-middle">
                      <div className="truncate font-medium text-foreground">
                        {displayStaffName(user)}
                      </div>
                      <div className="truncate text-xs text-muted lg:hidden">
                        {user.email}
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-2 align-middle text-muted lg:table-cell">
                      {user.email}
                    </td>
                    <td className="px-3 py-2 align-middle font-mono text-sm text-foreground">
                      {formatEmployeeIdDisplay(user.employee_id)}
                    </td>
                    <td className="hidden px-3 py-2 align-middle sm:table-cell">
                      <UserRoleBadge role={user.role} />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => openDrawer(user)}
                        className={`${linkButtonClass("secondary")} ${compactManageButtonClass}`}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <HrUserDetailsDrawer
        key={selectedUserId ?? "closed"}
        user={selectedUser}
        open={drawerOpen}
        onClose={closeDrawer}
        onUserUpdated={(updated) => {
          setRows((current) => mergeStaffDirectoryRow(current, updated));
        }}
      />
    </>
  );
}

export function HrUsersWorkspace(props: Props) {
  return (
    <ToastProvider>
      <HrUsersWorkspaceContent {...props} />
    </ToastProvider>
  );
}
