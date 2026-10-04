"use client";

import { useState } from "react";

import {
  NotificationDeliveryBatchStatusBadge,
  NotificationDeliveryRecipientStatusBadge,
} from "@/components/admin/notification-delivery-status-badge";
import { Card } from "@/components/ui/card";
import { formatNotificationDeliveryLastError } from "@/lib/notification-delivery";
import type {
  NotificationDeliveryBatchDetail,
  NotificationDeliveryContentSample,
  NotificationDeliveryRecipientRow,
} from "@/lib/notification-delivery-server";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export function NotificationDeliveryDetailView({
  detail,
  recipients,
  content,
}: {
  detail: NotificationDeliveryBatchDetail;
  recipients: NotificationDeliveryRecipientRow[];
  content: NotificationDeliveryContentSample | null;
}) {
  const [tab, setTab] = useState<"recipients" | "content">("recipients");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {detail.eventName} – delivery details
          </h1>
          <p className="mt-1 text-sm text-muted">
            Operational date {detail.operationalDate} · Created {formatTimestamp(detail.createdAt)}
          </p>
        </div>
        <NotificationDeliveryBatchStatusBadge status={detail.batchStatus} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 text-sm">
          <p className="text-muted">Recipients</p>
          <p className="mt-1 text-lg font-semibold">{detail.recipientCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Sent</p>
          <p className="mt-1 text-lg font-semibold">{detail.sentCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Failed</p>
          <p className="mt-1 text-lg font-semibold">{detail.failedCount}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Pending</p>
          <p className="mt-1 text-lg font-semibold">{detail.pendingCount}</p>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "recipients"
              ? "border-primary text-primary"
              : "border-transparent text-muted"
          }`}
          aria-selected={tab === "recipients"}
          role="tab"
          onClick={() => setTab("recipients")}
        >
          Recipients
        </button>
        <button
          type="button"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "content" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}
          aria-selected={tab === "content"}
          role="tab"
          onClick={() => setTab("content")}
        >
          Email content
        </button>
      </div>

      {tab === "recipients" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Sent at
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Retries
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.deliveryId} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">{recipient.recipientName}</td>
                    <td className="px-4 py-3">{recipient.recipientEmail ?? "—"}</td>
                    <td className="px-4 py-3">
                      <NotificationDeliveryRecipientStatusBadge
                        status={recipient.status}
                        lastError={recipient.lastError}
                      />
                    </td>
                    <td className="px-4 py-3">{formatTimestamp(recipient.sentAt)}</td>
                    <td className="px-4 py-3">
                      {Math.max(recipient.transportAttempts - 1, 0)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatNotificationDeliveryLastError(recipient.lastError)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          {content ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subject</p>
                <p className="mt-1 text-sm text-foreground">{content.renderedSubject}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">HTML body</p>
                <div
                  className="prose prose-sm mt-2 max-w-none rounded-lg border border-border bg-surface p-4"
                  dangerouslySetInnerHTML={{ __html: content.renderedHtmlBody ?? "" }}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Text body</p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface p-4 text-xs whitespace-pre-wrap">
                  {content.renderedTextBody}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No rendered content snapshot is stored for this batch yet.</p>
          )}
        </Card>
      )}
    </div>
  );
}
