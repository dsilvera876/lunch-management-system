import Link from "next/link";

import { NotificationDeliveryBatchStatusBadge } from "@/components/admin/notification-delivery-status-badge";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";
import { NOTIFICATION_EMAIL_DELIVERY_PATH } from "@/lib/notification-delivery";
import type { NotificationDeliveryBatchRow } from "@/lib/notification-delivery-server";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export function NotificationDeliveryHistory({
  rows,
  from,
  to,
  eventKey,
  status,
  page,
  hasMore,
}: {
  rows: NotificationDeliveryBatchRow[];
  from: string;
  to: string;
  eventKey: string;
  status: string;
  page: number;
  hasMore: boolean;
}) {
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = hasMore ? page + 1 : null;

  function query(pageNumber: number) {
    const params = new URLSearchParams({
      from,
      to,
      page: String(pageNumber),
    });

    if (eventKey) {
      params.set("event", eventKey);
    }

    if (status) {
      params.set("status", status);
    }

    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <Link href={NOTIFICATION_EMAIL_DELIVERY_PATH} className={linkButtonClass("ghost")}>
        ← Back to Email Delivery
      </Link>

      <form className="grid gap-3 md:grid-cols-4" method="get">
        <div>
          <label htmlFor="history-from" className="text-xs font-medium text-foreground">
            From
          </label>
          <input
            id="history-from"
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="history-to" className="text-xs font-medium text-foreground">
            To
          </label>
          <input
            id="history-to"
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="history-event" className="text-xs font-medium text-foreground">
            Event
          </label>
          <select
            id="history-event"
            name="event"
            defaultValue={eventKey}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All events</option>
            <option value="staff.today_menu">Today&apos;s Menu</option>
          </select>
        </div>
        <div>
          <label htmlFor="history-status" className="text-xs font-medium text-foreground">
            Status
          </label>
          <select
            id="history-status"
            name="status"
            defaultValue={status}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <div className="md:col-span-4">
          <button type="submit" className={linkButtonClass("secondary")}>
            Apply filters
          </button>
        </div>
      </form>

      <Card className="overflow-hidden">
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    No deliveries match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
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

      <nav className="flex items-center justify-end gap-2" aria-label="Delivery history pagination">
        {previousPage ? (
          <Link href={query(previousPage)} className={linkButtonClass("secondary")}>
            Previous
          </Link>
        ) : (
          <span className={linkButtonClass("secondary") + " pointer-events-none opacity-50"}>
            Previous
          </span>
        )}
        <span className="text-sm text-muted">Page {page}</span>
        {nextPage ? (
          <Link href={query(nextPage)} className={linkButtonClass("secondary")}>
            Next
          </Link>
        ) : (
          <span className={linkButtonClass("secondary") + " pointer-events-none opacity-50"}>
            Next
          </span>
        )}
      </nav>
    </div>
  );
}
