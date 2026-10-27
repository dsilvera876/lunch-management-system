"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { formatDeadline, formatHumanDate } from "@/lib/format";
import { normalizeLateOrderSubmissionStatus } from "@/lib/staff-late-order-submissions";
import { LateOrderSubmissionEditModal } from "@/components/my-orders/late-order-submission-edit-modal";
import { cancelStaffLateOrderRequestAction } from "@/app/home/staff-late-order-request-actions";
import { ProviderIconWell } from "@/lib/provider-icons";
import {
  IconCheck,
  IconCircleX,
  IconClock,
  IconMapPin,
  IconReceipt,
} from "@/components/icons/line-icons";

type Props = {
  request: StaffLateOrderRequestRow;
};

function LateOrderSubmissionStatusBadge({ status }: { status: string }) {
  const normalized = normalizeLateOrderSubmissionStatus(status);
  const presentation =
    normalized === "fulfilled"
      ? {
          label: "Fulfilled",
          className: "bg-emerald-100 text-emerald-900 ring-emerald-300",
          Icon: IconCheck,
        }
      : normalized === "declined"
        ? {
            label: "Declined",
            className: "bg-rose-100 text-rose-950 ring-rose-300",
            Icon: IconCircleX,
          }
        : normalized === "cancelled"
          ? {
              label: "Cancelled",
              className: "bg-slate-200 text-slate-900 ring-slate-300",
              Icon: IconCircleX,
            }
          : normalized === "pending"
            ? {
                label: "Pending",
                className: "bg-amber-100 text-amber-950 ring-amber-300",
                Icon: IconClock,
              }
            : {
                label: normalized === "expired" ? "Expired" : "Status unavailable",
                className: "bg-slate-200 text-slate-900 ring-slate-300",
                Icon: IconClock,
              };
  const StatusIcon = presentation.Icon;

  return (
    <span
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-inset ${presentation.className}`}
      data-testid="late-order-status"
    >
      <StatusIcon size={18} aria-hidden />
      {presentation.label}
    </span>
  );
}

export function LateOrderSubmissionCard({ request }: Props) {
  const router = useRouter();
  const headingId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const normalizedStatus = normalizeLateOrderSubmissionStatus(request.status);

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
      <article
        aria-labelledby={headingId}
        className="max-w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        data-testid="late-order-submission-card"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-teal-200 bg-teal-50 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden data-testid="late-order-provider-icon">
              <ProviderIconWell
                iconKey={request.provider_icon_key}
                size="large"
                className="bg-white/80"
                alt=""
              />
            </span>
            <div className="min-w-0">
              <h3 id={headingId} className="break-words text-lg font-semibold text-slate-950">
                {request.provider_name}
              </h3>
              <p className="mt-0.5 text-sm text-slate-700">
                Delivery {formatHumanDate(request.scheduled_delivery_date)}
              </p>
            </div>
          </div>
          <LateOrderSubmissionStatusBadge status={request.status} />
        </header>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <dl className="grid gap-3 text-sm text-foreground sm:grid-cols-2 sm:divide-x sm:divide-border">
            <div className="min-w-0 sm:pr-4">
              <dt className="flex items-center gap-3 font-medium text-muted">
                <IconMapPin size={20} className="shrink-0 text-slate-600" aria-hidden />
                <span>Location</span>
              </dt>
              <dd className="ml-8 mt-0.5 break-words">{request.office_location_name}</dd>
            </div>
            <div className="min-w-0 sm:pl-4">
              <dt className="flex items-center gap-3 font-medium text-muted">
                <IconClock size={20} className="shrink-0 text-slate-600" aria-hidden />
                <span>Submitted</span>
              </dt>
              <dd className="ml-8 mt-0.5">{formatDeadline(request.created_at)}</dd>
            </div>
            <div className="min-w-0 sm:pr-4">
              <dt className="flex items-center gap-3 font-medium text-muted">
                <IconReceipt size={20} className="shrink-0 text-slate-600" aria-hidden />
                <span>Quantity</span>
              </dt>
              <dd className="ml-8 mt-0.5 tabular-nums">{request.quantity}</dd>
            </div>
          </dl>

          <section
            aria-label="Requested items"
            className="flex min-w-0 gap-3 rounded-lg bg-slate-50 px-3 py-3"
          >
            <IconReceipt size={20} className="mt-0.5 shrink-0 text-slate-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Requested items
              </p>
              <p className="mt-1 break-words text-sm text-foreground">
                {request.requested_summary}
              </p>
            </div>
          </section>

          {request.special_instructions ? (
            <section
              aria-label="Special instructions"
              className="rounded-lg bg-amber-50 px-3 py-3 text-amber-950"
            >
              <p className="text-xs font-semibold uppercase tracking-wide">
                Special instructions
              </p>
              <p className="mt-1 break-words text-sm">{request.special_instructions}</p>
            </section>
          ) : null}

          {normalizedStatus === "declined" && request.decline_reason ? (
            <section
              aria-label="Decline reason"
              className="rounded-lg bg-rose-50 px-3 py-3 text-rose-950"
              role="status"
            >
              <p className="text-xs font-semibold uppercase tracking-wide">Decline reason</p>
              <p className="mt-1 break-words text-sm">{request.decline_reason}</p>
            </section>
          ) : null}

          {feedback ? (
            <FormActionStatus
              ref={feedbackRef}
              variant={feedback.kind === "success" ? "success" : "error"}
            >
              {feedback.message}
            </FormActionStatus>
          ) : null}
        </div>

        {normalizedStatus === "pending" ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-slate-50/70 px-4 py-3.5 sm:px-5">
            <Button
              type="button"
              variant="secondary"
              ref={editTriggerRef}
              onClick={() => setEditOpen(true)}
            >
              Edit
              <span className="sr-only"> late order submission for {request.provider_name}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
              <span className="sr-only"> late order submission for {request.provider_name}</span>
            </Button>
          </footer>
        ) : null}
      </article>

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
