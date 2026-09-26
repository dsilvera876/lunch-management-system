"use client";

import { useMemo, useState } from "react";
import { IconPencil } from "@/components/icons/line-icons";
import { EditUserDrawer } from "@/components/admin/edit-user-drawer";
import { SystemOwnershipCard } from "@/components/admin/system-ownership-card";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import { ProfileMutationRefresh } from "@/components/profile-mutation-refresh";
import {
  USER_DIRECTORY_PAGE_SIZE,
  applyOwnershipTransfer,
  displayUserName,
  filterManageableUsers,
  mergeManageableUser,
  paginateUsers,
  userDirectoryCountLabel,
  type ManageableUserRecord,
  type UserRoleFilter,
} from "@/lib/user-management-presentation";
import { USER_ROLES, getRoleLabel } from "@/lib/roles";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";

type Props = {
  initialUsers: ManageableUserRecord[];
  viewerRole: string;
  viewerId: string;
  canTransferOwnership: boolean;
};

const compactEditButtonClass =
  "!min-h-0 h-8 shrink-0 whitespace-nowrap px-2.5 py-0 text-xs leading-none";

function UserManagementWorkspaceContent({
  initialUsers,
  viewerRole,
  viewerId,
  canTransferOwnership,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshViewerRole, setRefreshViewerRole] = useState(false);

  const filteredUsers = useMemo(
    () => filterManageableUsers(users, search, roleFilter),
    [users, search, roleFilter],
  );

  const hasActiveFilters =
    search.trim().length > 0 || roleFilter !== "all";

  const { page: safePage, totalPages, slice: pageUsers } = useMemo(
    () => paginateUsers(filteredUsers, page, USER_DIRECTORY_PAGE_SIZE),
    [filteredUsers, page],
  );

  const selectedUser = useMemo(
    () =>
      selectedUserId === null
        ? null
        : (users.find((user) => user.id === selectedUserId) ?? null),
    [selectedUserId, users],
  );

  const currentOwnerId = useMemo(
    () => users.find((user) => user.role === "owner")?.id ?? viewerId,
    [users, viewerId],
  );

  function openEditor(user: ManageableUserRecord) {
    setSelectedUserId(user.id);
    setDrawerOpen(true);
  }

  function closeEditor() {
    setDrawerOpen(false);
    setSelectedUserId(null);
  }

  function handleUserUpdated(user: ManageableUserRecord) {
    setUsers((current) => mergeManageableUser(current, user));
  }

  function handleOwnershipTransferred(previousOwnerId: string, newOwnerId: string) {
    setUsers((current) =>
      applyOwnershipTransfer(current, previousOwnerId, newOwnerId),
    );
  }

  return (
    <>
      <ProfileMutationRefresh
        active={refreshViewerRole}
        renderedRole={viewerRole}
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-x-3 md:gap-y-3">
        <div className="w-full md:w-[24rem] lg:w-[28rem]">
          <FormField label="Search" htmlFor="user-directory-search">
            <input
              id="user-directory-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email…"
              className={inputClassName}
            />
          </FormField>
        </div>
        <div className="w-full md:w-[11rem]">
          <FormField label="Role" htmlFor="user-directory-role">
            <select
              id="user-directory-role"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as UserRoleFilter);
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
          {userDirectoryCountLabel(filteredUsers.length, users.length, hasActiveFilters)}
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users found." description="" />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No users match your search or filters."
          description=""
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full table-fixed text-left text-sm">
              <thead className="border-b border-border bg-slate-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {pageUsers.map((user) => (
                  <tr key={user.id} className="h-[3.25rem]">
                    <td className="px-3 py-2 align-middle">
                      <div className="truncate font-medium text-foreground">
                        {displayUserName(user)}
                      </div>
                      <div className="truncate text-xs text-muted md:hidden">
                        {user.email}
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-2 align-middle text-muted md:table-cell">
                      {user.email}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <UserRoleBadge role={user.role} />
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        aria-label="Edit user"
                        onClick={() => openEditor(user)}
                        className={`${linkButtonClass("secondary")} ${compactEditButtonClass} inline-flex items-center justify-center gap-1`}
                      >
                        <IconPencil size={13} aria-hidden />
                        <span className="hidden sm:inline">Edit</span>
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
                Page {safePage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={safePage >= totalPages}
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

      {canTransferOwnership ? (
        <SystemOwnershipCard
          users={users}
          currentOwnerId={currentOwnerId}
          onOwnershipTransferred={handleOwnershipTransferred}
          onViewerRoleChanged={() => setRefreshViewerRole(true)}
        />
      ) : null}

      <EditUserDrawer
        key={selectedUserId ?? "closed"}
        user={selectedUser}
        open={drawerOpen}
        onClose={closeEditor}
        onUserUpdated={handleUserUpdated}
      />
    </>
  );
}

export function UserManagementWorkspace(props: Props) {
  return (
    <ToastProvider>
      <UserManagementWorkspaceContent {...props} />
    </ToastProvider>
  );
}
