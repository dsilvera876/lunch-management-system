"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchSignupRequests } from "@/app/admin/users/signup-request-actions";
import { HrSignupRequestDrawer } from "@/components/admin/hr-signup-request-drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastProvider } from "@/components/ui/toast";
import {
  SIGNUP_REQUEST_PAGE_SIZE,
  signupRequestCountLabel,
  signupRequestNeedsInvitationResume,
  type SignupRequestRow,
  type SignupRequestStatus,
} from "@/lib/signup-request-presentation";

type Props = {
  initialRows: SignupRequestRow[];
  initialTotalCount: number;
  initialStatus?: SignupRequestStatus;
};

function HrSignupRequestsWorkspaceContent({
  initialRows,
  initialTotalCount,
  initialStatus = "pending",
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SignupRequestStatus>(initialStatus);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const skipInitialFetchRef = useRef(true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(handle);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / SIGNUP_REQUEST_PAGE_SIZE));

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const result = await searchSignupRequests({
      search: debouncedSearch,
      status: statusFilter,
      page,
      pageSize: SIGNUP_REQUEST_PAGE_SIZE,
    });

    setLoading(false);

    if (!result.success) {
      setLoadError("Unable to load signup requests.");
      return;
    }

    setRows(result.rows);
    setTotalCount(result.totalCount);
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    if (
      skipInitialFetchRef.current &&
      debouncedSearch === "" &&
      statusFilter === initialStatus &&
      page === 1
    ) {
      skipInitialFetchRef.current = false;
      return;
    }

    skipInitialFetchRef.current = false;
    void fetchRequests();
  }, [fetchRequests, debouncedSearch, statusFilter, page, initialStatus]);

  const selectedRequest = useMemo(
    () =>
      selectedRequestId === null
        ? null
        : (rows.find((row) => row.request_id === selectedRequestId) ?? null),
    [rows, selectedRequestId],
  );

  function openDrawer(request: SignupRequestRow) {
    setSelectedRequestId(request.request_id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedRequestId(null);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-x-3 md:gap-y-3">
        <div className="w-full md:w-[24rem] lg:w-[28rem]">
          <FormField label="Search" htmlFor="hr-signup-search">
            <input
              id="hr-signup-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className={inputClassName}
            />
          </FormField>
        </div>
        <div className="w-full md:w-[11rem]">
          <FormField label="Status" htmlFor="hr-signup-status">
            <select
              id="hr-signup-status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as SignupRequestStatus);
                setPage(1);
              }}
              className={selectClassName}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </FormField>
        </div>
        <p className="text-sm font-medium text-muted md:ml-auto md:pb-2">
          {loading ? "Loading requests…" : signupRequestCountLabel(rows.length, totalCount)}
        </p>
      </div>

      {loadError ? (
        <EmptyState title={loadError} description="Try refreshing the page." />
      ) : !loading && rows.length === 0 ? (
        <EmptyState
          title="No signup requests match your search or filters."
          description=""
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full table-fixed text-left text-sm" data-testid="hr-signup-requests-table">
              <thead className="border-b border-border bg-slate-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Requested</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {rows.map((request) => (
                  <tr key={request.request_id} className="h-[3.25rem]">
                    <td className="px-3 py-2 align-middle">
                      <div className="truncate font-medium text-foreground">{request.full_name}</div>
                      <div className="truncate text-xs text-muted lg:hidden">{request.email}</div>
                    </td>
                    <td className="hidden truncate px-3 py-2 align-middle text-muted lg:table-cell">
                      {request.email}
                    </td>
                    <td className="px-3 py-2 align-middle text-muted">
                      {new Date(request.requested_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <StatusBadge
                        status={
                          request.status === "pending"
                            ? "open"
                            : request.status === "approved"
                              ? "active"
                              : "inactive"
                        }
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      {request.status === "pending" || signupRequestNeedsInvitationResume(request) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="!min-h-0 h-8 px-2.5 py-0 text-xs"
                          onClick={() => openDrawer(request)}
                        >
                          {signupRequestNeedsInvitationResume(request) ? "Retry invitation" : "Review"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <HrSignupRequestDrawer
        key={selectedRequest?.request_id ?? "closed"}
        request={selectedRequest}
        open={drawerOpen}
        onClose={closeDrawer}
        onUpdated={() => {
          void fetchRequests();
        }}
      />
    </>
  );
}

export function HrSignupRequestsWorkspace(props: Props) {
  return (
    <ToastProvider>
      <HrSignupRequestsWorkspaceContent {...props} />
    </ToastProvider>
  );
}
