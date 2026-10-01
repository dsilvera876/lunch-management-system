import Link from "next/link";

import { NotificationDeliveryBatchStatusBadge } from "@/components/admin/notification-delivery-status-badge";
import { NotificationDeliveryRefreshButton } from "@/components/admin/notification-delivery-refresh-button";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";
import {
  NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH,
  NOTIFICATION_EMAIL_DELIVERY_PATH,
} from "@/lib/notification-delivery";
import { NotificationProcessingActivity } from "@/components/admin/notification-processing-activity";
import type {
  NotificationDeliveryBatchRow,
  NotificationDeliveryDashboardSummary,
  NotificationProcessingRunRow,
} from "@/lib/notification-delivery-server";

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value.toLocaleString()}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export function NotificationDeliveryDashboard({
  summary,
  recent,
  processing,
  from,
  to,
}: {
  summary: NotificationDeliveryDashboardSummary;
  recent: NotificationDeliveryBatchRow[];
  processing: NotificationProcessingRunRow[];
  from: string;
  to: string;
}) {
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="delivery-from" className="text-xs font-medium text-foreground">
            From
          </label>
          <input
            id="delivery-from"
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="delivery-to" className="text-xs font-medium text-foreground">
            To
          </label>
          <input
            id="delivery-to"
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className={linkButtonClass("secondary")}>
          Apply range
        </button>
        <NotificationDeliveryRefreshButton />
        <Link href={NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH} className={linkButtonClass("ghost")}>
          View all history
        </Link>
      </form>

      <p className="text-xs text-muted">
        Summary counts are individual recipient notification emails in the selected date range
        (not delivery batches).
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total emails" value={summary.totalCount} />
        <SummaryCard label="Sent" value={summary.sentCount} hint="SMTP handoff confirmed" />
        <SummaryCard label="Failed" value={summary.failedCount} hint="Terminal transport failure" />
        <SummaryCard
          label="Pending"
          value={summary.pendingCount}
          hint="Awaiting queue or SMTP send"
        />
      </div>

      <NotificationProcessingActivity rows={processing} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent notification deliveries</h2>
          <Link
            href={`${NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH}?from=${from}&to=${to}`}
            className="text-sm font-medium text-primary no-underline hover:underline"
          >
            View all deliveries →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Created
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Event
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Recipients
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    No notification deliveries in this date range.
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.batchId} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">{formatTimestamp(row.createdAt)}</td>
                    <td className="px-4 py-3">{row.eventName}</td>
                    <td className="px-4 py-3">{row.recipientCount}</td>
                    <td className="px-4 py-3">
                      <NotificationDeliveryBatchStatusBadge status={row.batchStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`${NOTIFICATION_EMAIL_DELIVERY_PATH}/${row.batchId}`}
                        className="font-medium text-primary no-underline hover:underline"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
