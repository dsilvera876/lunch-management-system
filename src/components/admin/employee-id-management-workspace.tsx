"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  searchEmployeeIdDirectory,
  setEmployeeIdInline,
} from "@/app/admin/employee-ids/actions";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { Button, linkButtonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  formatEmployeeIdDisplay,
  validateEmployeeIdField,
} from "@/lib/employee-id";
import {
  STAFF_DIRECTORY_PAGE_SIZE,
  displayStaffName,
  employeeIdDirectoryCountLabel,
  mergeEmployeeIdDirectoryRow,
  type EmployeeIdDirectoryRow,
} from "@/lib/staff-directory-presentation";

type Props = {
  initialRows: EmployeeIdDirectoryRow[];
  initialTotalCount: number;
};

const compactManageButtonClass =
  "!min-h-0 h-8 shrink-0 whitespace-nowrap px-2.5 py-0 text-xs leading-none";

function EmployeeIdEditDrawer({
  user,
  open,
  onClose,
  onUserUpdated,
}: {
  user: EmployeeIdDirectoryRow | null;
  open: boolean;
  onClose: () => void;
  onUserUpdated: (user: EmployeeIdDirectoryRow) => void;
}) {
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const employeeIdRaw = String(formData.get("employeeId") ?? "");
    const validation = validateEmployeeIdField(employeeIdRaw);

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await setEmployeeIdInline({
        profileId: user.profile_id,
        employeeId: employeeIdRaw,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onUserUpdated(result.row);
      showToast({ title: "Employee ID updated" });
      onClose();
    });
  }

  return (
    <AdminSlideOver
      open={open}
      title="Employee ID"
      onClose={onClose}
      footer={
        user ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="employee-id-edit-form"
              variant="primary"
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null
      }
    >
      {user ? (
        <form id="employee-id-edit-form" key={user.profile_id} className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <p className="text-base font-semibold text-foreground">
              {displayStaffName(user)}
            </p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>

          <FormField label="Employee ID" htmlFor={`employee-id-${user.profile_id}`}>
            <input
              id={`employee-id-${user.profile_id}`}
              name="employeeId"
              defaultValue={user.employee_id ?? ""}
              placeholder={formatEmployeeIdDisplay(null)}
              inputMode="numeric"
              maxLength={4}
              className={inputClassName}
            />
          </FormField>

          {error ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </AdminSlideOver>
  );
}

function EmployeeIdManagementWorkspaceContent({
  initialRows,
  initialTotalCount,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

    const result = await searchEmployeeIdDirectory({
      search: debouncedSearch,
      page,
      pageSize: STAFF_DIRECTORY_PAGE_SIZE,
    });

    setLoading(false);

    if (!result.success) {
      setLoadError("Unable to load employees.");
      return;
    }

    setRows(result.rows);
    setTotalCount(result.totalCount);
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (skipInitialFetchRef.current && debouncedSearch === "" && page === 1) {
      skipInitialFetchRef.current = false;
      return;
    }

    skipInitialFetchRef.current = false;
    void fetchDirectory();
  }, [fetchDirectory, debouncedSearch, page]);

  const selectedUser = useMemo(
    () =>
      selectedUserId === null
        ? null
        : (rows.find((row) => row.profile_id === selectedUserId) ?? null),
    [rows, selectedUserId],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:gap-3">
        <div className="w-full md:w-[24rem] lg:w-[28rem]">
          <FormField label="Search" htmlFor="employee-id-search">
            <input
              id="employee-id-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or Employee ID"
              className={inputClassName}
            />
          </FormField>
        </div>
        <p className="text-sm font-medium text-muted md:ml-auto md:pb-2">
          {loading
            ? "Loading employees…"
            : employeeIdDirectoryCountLabel(rows.length, totalCount)}
        </p>
      </div>

      {loadError ? (
        <EmptyState title={loadError} description="Try refreshing the page." />
      ) : !loading && rows.length === 0 ? (
        <EmptyState title="No employees match your search." description="" />
      ) : (
        <>
          <div
            className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
            data-testid="employee-id-management-table"
          >
            <table className="min-w-full table-fixed text-left text-sm">
              <thead className="border-b border-border bg-slate-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Employee ID</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {rows.map((user) => (
                  <tr key={user.profile_id}>
                    <td className="px-3 py-2 align-middle">
                      <div className="truncate font-medium text-foreground">
                        {displayStaffName(user)}
                      </div>
                      <div className="truncate text-xs text-muted md:hidden">
                        {user.email}
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-2 align-middle text-muted md:table-cell">
                      {user.email}
                    </td>
                    <td className="px-3 py-2 align-middle font-mono text-sm">
                      {formatEmployeeIdDisplay(user.employee_id)}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId(user.profile_id);
                          setDrawerOpen(true);
                        }}
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

      <EmployeeIdEditDrawer
        user={selectedUser}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedUserId(null);
        }}
        onUserUpdated={(updated) => {
          setRows((current) => mergeEmployeeIdDirectoryRow(current, updated));
        }}
      />
    </>
  );
}

export function EmployeeIdManagementWorkspace(props: Props) {
  return (
    <ToastProvider>
      <EmployeeIdManagementWorkspaceContent {...props} />
    </ToastProvider>
  );
}
