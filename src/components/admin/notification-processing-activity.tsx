import Link from "next/link";

import { NotificationProcessingStatusBadge } from "@/components/admin/notification-delivery-status-badge";
import { Card } from "@/components/ui/card";
import {
  formatNotificationSkipReasonCounts,
  notificationProcessingPath,
} from "@/lib/notification-delivery";
import type { NotificationProcessingRunRow } from "@/lib/notification-delivery-server";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

function formatScheduledTime(value: string): string {
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Jamaica",
  }).format(date);
}

export function NotificationProcessingActivity({
  rows,
}: {
  rows: NotificationProcessingRunRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Recent processing activity</h2>
        <p className="mt-1 text-xs text-muted">
          Scheduled notification generation runs (not individual emails). Skipped runs explain why
          no delivery records were created.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Scheduled
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Event
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Candidates
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Eligible
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Result
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted">
                  No processing activity in this date range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.runId} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">
                    <div>{formatTimestamp(row.lastCheckedAt)}</div>
                    <div className="text-xs text-muted">
                      Send {formatScheduledTime(row.scheduledSendTime)} · {row.operationalDate}
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.eventName}</td>
                  <td className="px-4 py-3">{row.candidateCount}</td>
                  <td className="px-4 py-3">{row.eligibleCount}</td>
                  <td className="px-4 py-3">
                    <NotificationProcessingStatusBadge status={row.processingStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs text-xs text-muted">
                      {formatNotificationSkipReasonCounts(row.skipReasonCounts)}
                    </div>
                    <Link
                      href={notificationProcessingPath(row.runId)}
                      className="mt-1 inline-block font-medium text-primary no-underline hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
