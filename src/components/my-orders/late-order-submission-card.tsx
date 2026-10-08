"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";
import { Button, linkButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDeadline, formatHumanDate } from "@/lib/format";
import { lateOrderRequestStatusBadgeStatus } from "@/lib/staff-late-order-submissions";
import { LateOrderSubmissionEditModal } from "@/components/my-orders/late-order-submission-edit-modal";
import { cancelStaffLateOrderRequestAction } from "@/app/home/staff-late-order-request-actions";

type Props = {
  request: StaffLateOrderRequestRow;
};

export function LateOrderSubmissionCard({ request }: Props) {
  const router = useRouter();
  const statusId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const normalizedStatus = request.status.trim().toLowerCase();

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleCancel() {
    setFeedback(null);
    startTransition(async () => {
      const result = await cancelStaffLateOrderRequestAction(request.id);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        feedbackRef.current?.focus();
        return;
      }
      setFeedback({ kind: "success", message: "Late order submission cancelled." });
      feedbackRef.current?.focus();
      refresh();
    });
  }

  return (
    <>
      <Card padding="md" className="max-w-full overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                {formatHumanDate(request.scheduled_delivery_date)} · {request.provider_name}
              </p>
              <p className="mt-1 text-sm text-staff-instruction">
                {request.office_location_name}
              </p>
            </div>
            <div id={statusId}>
              <StatusBadge status={lateOrderRequestStatusBadgeStatus(request.status)} />
            </div>
            <dl className="space-y-1 text-sm text-foreground">
              <div>
                <dt className="inline font-medium after:content-[':']">Requested</dt>{" "}
                <dd className="inline">{request.requested_summary}</dd>
              </div>
              <div>
                <dt className="inline font-medium after:content-[':']">Quantity</dt>{" "}
                <dd className="inline">{request.quantity}</dd>
              </div>
              {request.special_instructions ? (
                <div>
                  <dt className="inline font-medium after:content-[':']">Instructions</dt>{" "}
                  <dd className="inline">{request.special_instructions}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline font-medium after:content-[':']">Submitted</dt>{" "}
                <dd className="inline">{formatDeadline(request.created_at)}</dd>
              </div>
            </dl>
            {normalizedStatus === "declined" && request.decline_reason ? (
              <p className="text-sm text-staff-instruction" role="status">
                Reason: {request.decline_reason}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {normalizedStatus === "pending" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  ref={editTriggerRef}
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </>
            ) : null}
            {normalizedStatus === "fulfilled" && request.fulfilled_order_id ? (
              <Link
                href={`/lunch/orders/${request.fulfilled_order_id}`}
                className={linkButtonClass("secondary")}
              >
                View order
              </Link>
            ) : null}
          </div>
        </div>
        {feedback ? (
          <FormActionStatus
            ref={feedbackRef}
            variant={feedback.kind === "success" ? "success" : "error"}
            className="mt-3"
          >
            {feedback.message}
          </FormActionStatus>
        ) : null}
      </Card>

      {normalizedStatus === "pending" ? (
        <LateOrderSubmissionEditModal
          open={editOpen}
          triggerRef={editTriggerRef}
          request={request}
          onOpenChange={setEditOpen}
          onSaved={() => {
            setFeedback({ kind: "success", message: "Late order submission updated." });
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
