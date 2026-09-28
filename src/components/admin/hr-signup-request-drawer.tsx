"use client";

import { useState, useTransition } from "react";
import {
  approveSignupRequest,
  rejectSignupRequest,
  retrySignupRequestInvitation,
} from "@/app/admin/users/signup-request-actions";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { validateEmployeeIdField } from "@/lib/employee-id";
import { resolveSignupDrawerActionOutcome } from "@/lib/hr-signup-request-action-result";
import {
  signupRequestNeedsInvitationResume,
  type SignupRequestRow,
} from "@/lib/signup-request-presentation";

type Props = {
  request: SignupRequestRow | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

function formatRequestedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function HrSignupRequestDrawer({ request, open, onClose, onUpdated }: Props) {
  const [employeeId, setEmployeeId] = useState(() => request?.requested_employee_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resumeInvite = request ? signupRequestNeedsInvitationResume(request) : false;

  if (!request) {
    return null;
  }

  function resetAndClose() {
    setEmployeeId("");
    setError(null);
    setWarning(null);
    setSuccessMessage(null);
    onClose();
  }

  function handleReject() {
    if (resumeInvite) {
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
      const action = resumeInvite ? retrySignupRequestInvitation : approveSignupRequest;
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
        resumeInvite ? "Invitation sent successfully." : "Request approved and invitation sent.",
      );
      resetAndClose();
      onUpdated();
    });
  }

  const approveLabel = resumeInvite ? "Retry invitation" : "Approve request";
  const approvePendingLabel = resumeInvite ? "Retrying invitation…" : "Approving…";

  return (
    <AdminSlideOver
      open={open}
      onClose={resetAndClose}
      title={resumeInvite ? "Retry invitation" : "Review signup request"}
      description={
        resumeInvite
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

        {resumeInvite && request.invite_last_error ? (
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
            value={formatRequestedAt(request.requested_at)}
            className={`${inputClassName} bg-slate-50`}
          />
        </FormField>

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
          />
        </FormField>

        <FormField label="Initial role" htmlFor="signup-review-role">
          <div id="signup-review-role" className="pt-1">
            <UserRoleBadge role="staff" />
          </div>
        </FormField>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={isPending}>
            Cancel
          </Button>
          {!resumeInvite ? (
            <Button type="button" variant="secondary" onClick={handleReject} disabled={isPending}>
              {isPending ? "Rejecting…" : "Reject request"}
            </Button>
          ) : null}
          <Button type="button" variant="primary" onClick={runApprovalOrRetry} disabled={isPending}>
            {isPending ? approvePendingLabel : approveLabel}
          </Button>
        </div>
      </div>
    </AdminSlideOver>
  );
}
