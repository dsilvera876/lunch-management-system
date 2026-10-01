import Link from "next/link";

import { NotificationProcessingStatusBadge } from "@/components/admin/notification-delivery-status-badge";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";
import {
  NOTIFICATION_EMAIL_DELIVERY_PATH,
  formatNotificationSkipReasonCounts,
} from "@/lib/notification-delivery";
import type { NotificationProcessingRunRow } from "@/lib/notification-delivery-server";

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export function NotificationProcessingDetailView({ run }: { run: NotificationProcessingRunRow }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {run.eventName} – processing details
          </h1>
          <p className="mt-1 text-sm text-muted">
            Operational date {run.operationalDate} · Scheduled send {run.scheduledSendTime}
          </p>
        </div>
        <NotificationProcessingStatusBadge status={run.processingStatus} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 text-sm">
          <p className="text-muted">Candidates</p>
          <p className="mt-1 text-lg font-semibold">{run.candidateCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Eligible</p>
          <p className="mt-1 text-lg font-semibold">{run.eligibleCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Generated</p>
          <p className="mt-1 text-lg font-semibold">{run.generatedCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Queued</p>
          <p className="mt-1 text-lg font-semibold">{run.queuedCount}</p>
        </Card>
      </div>

      <Card className="space-y-3 p-4 text-sm">
        <div>
          <p className="font-medium text-foreground">Run diagnostics</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Worker checks</dt>
              <dd>{run.runCount}</dd>
            </div>
            <div>
              <dt className="text-muted">First checked</dt>
              <dd>{formatTimestamp(run.firstCheckedAt ?? run.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Last checked</dt>
              <dd>{formatTimestamp(run.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Prepare reason</dt>
              <dd>{run.prepareReason ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Skip reason counts</dt>
              <dd>{formatNotificationSkipReasonCounts(run.skipReasonCounts)}</dd>
            </div>
          </dl>
        </div>

        {run.deliveryBatchId ? (
          <Link
            href={`${NOTIFICATION_EMAIL_DELIVERY_PATH}/${run.deliveryBatchId}`}
            className={linkButtonClass("secondary")}
          >
            View linked email delivery batch
          </Link>
        ) : null}
      </Card>
    </div>
  );
}
