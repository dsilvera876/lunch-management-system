"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveSignupRequest,
  cancelSignupRequest,
  rejectSignupRequest,
  retrySignupRequestInvitation,
} from "@/app/admin/users/signup-request-actions";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { validateEmployeeIdField } from "@/lib/employee-id";
import { resolveSignupDrawerActionOutcome } from "@/lib/hr-signup-request-action-result";
import {
  SIGNUP_CANCELLATION_REASON_OPTIONS,
  signupCancellationReasonLabel,
  signupRequestCanCancel,
  type SignupCancellationReason,
} from "@/lib/signup-request-cancellation";
import {
  signupRequestNeedsInvitationResume,
  signupRequestOnboardingIncomplete,
  type SignupRequestRow,
} from "@/lib/signup-request-presentation";

type Props = {
  request: SignupRequestRow | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onCancelled?: () => void;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function HrSignupRequestDrawer({
  request,
  open,
  onClose,
  onUpdated,
  onCancelled,
}: Props) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(() => request?.requested_employee_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<SignupCancellationReason>("incorrect_email");
  const [cancelNote, setCancelNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const resumeInvite = request ? signupRequestNeedsInvitationResume(request) : false;
  const onboardingIncomplete = request ? signupRequestOnboardingIncomplete(request) : false;
  const onboardingEstablished =
    request?.status === "approved" && request.onboarding_established === true;
  const isPendingReview = request?.status === "pending";
  const canCancel = request ? signupRequestCanCancel(request) : false;
  const isActionable = isPendingReview || onboardingIncomplete;
  const showInviteAction = onboardingIncomplete;
  const inviteIsRetry =
    resumeInvite ||
    Boolean(request?.created_profile_id) ||
    Boolean(request?.invite_sent_at);
  const isCancelled = request?.status === "cancelled";

  if (!request) {
    return null;
  }

  function resetAndClose() {
    setEmployeeId("");
    setError(null);
    setWarning(null);
    setSuccessMessage(null);
    setCancelDialogOpen(false);
    setCancelNote("");
    onClose();
  }

  function handleReject() {
    if (!isPendingReview) {
      return;
    }

    setError(null);
    setWarning(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await rejectSignupRequest({ requestId: request!.request_id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      resetAndClose();
      onUpdated();
      router.refresh();
    });
  }

  function runApprovalOrRetry() {
    setError(null);
    setWarning(null);
    setSuccessMessage(null);
    const validation = validateEmployeeIdField(employeeId);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    startTransition(async () => {
      const action = showInviteAction ? retrySignupRequestInvitation : approveSignupRequest;
      const result = await action({
        requestId: request!.request_id,
        employeeId,
      });

      const outcome = resolveSignupDrawerActionOutcome(result);

      if (outcome.kind === "error") {
        setError(outcome.error);
        if (outcome.refreshList) {
          onUpdated();
        }
        return;
      }

      if (outcome.kind === "partial") {
        setWarning(outcome.warning);
        onUpdated();
        return;
      }

      setSuccessMessage(
        showInviteAction && inviteIsRetry
          ? "Invitation sent successfully."
          : "Request approved and invitation sent.",
      );
      resetAndClose();
      onUpdated();
      router.refresh();
    });
  }

  function handleConfirmCancelRequest() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSignupRequest({
        requestId: request!.request_id,
        reason: cancelReason,
        note: cancelNote,
      });

      if (!result.success) {
        setError(result.error);
        setCancelDialogOpen(false);
        return;
      }

      setCancelDialogOpen(false);
      resetAndClose();
      onUpdated();
      router.refresh();
      onCancelled?.();
    });
  }

  const approveLabel = showInviteAction && inviteIsRetry ? "Retry invitation" : "Approve request";
  const approvePendingLabel =
    showInviteAction && inviteIsRetry ? "Retrying invitation…" : "Approving…";

  return (
    <>
      <AdminSlideOver
        open={open}
        onClose={resetAndClose}
        title={
          isCancelled
            ? "Cancelled signup request"
            : showInviteAction && inviteIsRetry
              ? "Retry invitation"
              : "Review signup request"
        }
        description={
          isCancelled
            ? "This request was cancelled and is kept for audit history."
            : onboardingEstablished
              ? "This user has already completed account setup. Manage the account from Users."
              : showInviteAction
                ? "Send or complete account setup without creating duplicate users."
                : "Approve or reject external email access requests."
        }
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {successMessage}
            </p>
          ) : null}

          {warning ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {warning}
            </p>
          ) : null}

          {onboardingEstablished ? (
            <p className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-muted">
              This user has already completed account setup. Manage the account from Users.
            </p>
          ) : null}

          {showInviteAction && request.invite_last_error ? (
            <p className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-muted">
              Previous invitation attempt did not complete. You can retry safely.
            </p>
          ) : null}

          <FormField label="Full name" htmlFor="signup-review-name">
            <input
              id="signup-review-name"
              type="text"
              readOnly
              value={request.full_name}
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          <FormField label="Email" htmlFor="signup-review-email">
            <input
              id="signup-review-email"
              type="email"
              readOnly
              value={request.email}
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          <FormField label="Requested" htmlFor="signup-review-requested">
            <input
              id="signup-review-requested"
              type="text"
              readOnly
              value={formatTimestamp(request.requested_at)}
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          {isCancelled ? (
            <>
              <FormField label="Cancelled" htmlFor="signup-review-cancelled-at">
                <input
                  id="signup-review-cancelled-at"
                  type="text"
                  readOnly
                  value={formatTimestamp(request.cancelled_at)}
                  className={`${inputClassName} bg-slate-50`}
                />
              </FormField>
              <FormField label="Reason" htmlFor="signup-review-cancel-reason">
                <input
                  id="signup-review-cancel-reason"
                  type="text"
                  readOnly
                  value={signupCancellationReasonLabel(request.cancellation_reason) ?? "—"}
                  className={`${inputClassName} bg-slate-50`}
                />
              </FormField>
              {request.cancellation_note ? (
                <FormField label="Note" htmlFor="signup-review-cancel-note">
                  <textarea
                    id="signup-review-cancel-note"
                    readOnly
                    value={request.cancellation_note}
                    className={`${inputClassName} min-h-[4rem] bg-slate-50`}
                  />
                </FormField>
              ) : null}
            </>
          ) : (
            <>
              <FormField
                label="Employee ID"
                htmlFor="signup-review-employee-id"
                description="Optional. Exactly four digits; leading zeroes are preserved."
              >
                <input
                  id="signup-review-employee-id"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  className={inputClassName}
                  placeholder="0054"
                  readOnly={!isActionable}
                />
              </FormField>

              <FormField label="Initial role" htmlFor="signup-review-role">
                <div id="signup-review-role" className="pt-1">
                  <UserRoleBadge role="staff" />
                </div>
              </FormField>
            </>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button type="button" variant="ghost" onClick={resetAndClose} disabled={isPending}>
              Close
            </Button>
            {canCancel && (isPendingReview || onboardingIncomplete) ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => setCancelDialogOpen(true)}
                disabled={isPending}
              >
                Cancel request
              </Button>
            ) : null}
            {isPendingReview ? (
              <Button type="button" variant="secondary" onClick={handleReject} disabled={isPending}>
                {isPending ? "Rejecting…" : "Reject request"}
              </Button>
            ) : null}
            {isPendingReview || showInviteAction ? (
              <Button type="button" variant="primary" onClick={runApprovalOrRetry} disabled={isPending}>
                {isPending ? approvePendingLabel : approveLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </AdminSlideOver>

      {cancelDialogOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-signup-request-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 id="cancel-signup-request-title" className="text-base font-semibold text-foreground">
              Cancel signup request?
            </h3>
            <p className="mt-2 text-sm text-muted">
              This will stop this signup request and prevent any pending account setup invitation
              from being sent. No user account will be created.
            </p>

            <div className="mt-4 space-y-4">
              <FormField label="Reason" htmlFor="cancel-signup-reason">
                <select
                  id="cancel-signup-reason"
                  className={selectClassName}
                  value={cancelReason}
                  disabled={isPending}
                  onChange={(event) =>
                    setCancelReason(event.target.value as SignupCancellationReason)
                  }
                >
                  {SIGNUP_CANCELLATION_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Optional note" htmlFor="cancel-signup-note">
                <textarea
                  id="cancel-signup-note"
                  className={`${inputClassName} min-h-[4rem]`}
                  value={cancelNote}
                  disabled={isPending}
                  onChange={(event) => setCancelNote(event.target.value)}
                />
              </FormField>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => setCancelDialogOpen(false)}
              >
                Keep Request
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={handleConfirmCancelRequest}
              >
                {isPending ? "Cancelling…" : "Cancel Request"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
