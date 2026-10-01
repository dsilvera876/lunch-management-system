import {
  notificationDeliveryBatchStatusLabel,
  notificationDeliveryRecipientStatusLabel,
} from "@/lib/notification-delivery";

const batchTone: Record<string, string> = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  partial: "border-amber-200 bg-amber-50 text-amber-900",
  pending: "border-slate-200 bg-slate-50 text-slate-700",
};

const recipientTone: Record<string, string> = {
  sent: batchTone.sent,
  failed: batchTone.failed,
  queued: "border-sky-200 bg-sky-50 text-sky-800",
  pending: batchTone.pending,
  skipped: "border-slate-200 bg-slate-100 text-slate-600",
};

export function NotificationDeliveryBatchStatusBadge({ status }: { status: string }) {
  const label = notificationDeliveryBatchStatusLabel(status);
  const tone = batchTone[status] ?? batchTone.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

export function NotificationDeliveryRecipientStatusBadge({ status }: { status: string }) {
  const label = notificationDeliveryRecipientStatusLabel(status);
  const tone = recipientTone[status] ?? recipientTone.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
