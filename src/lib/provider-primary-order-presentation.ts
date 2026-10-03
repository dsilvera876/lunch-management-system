export type ProviderPrimaryDispatchStatusRow = {
  providerId: string;
  scheduledDeliveryDate: string;
  latestStatus: string;
  latestDispatchId: string | null;
  resendSourceDispatchId: string | null;
  sentAt: string | null;
  errorSummary: string | null;
  automaticOutcome: string | null;
  primaryOrderEmail: string | null;
  qualifyingOrderCount: number;
  globallyEnabled: boolean;
  cutoffPassed: boolean;
  hasSuccessfulPrimarySend: boolean;
};

export function mapProviderPrimaryDispatchStatusRow(row: {
  provider_id: string;
  scheduled_delivery_date: string;
  latest_status: string;
  latest_dispatch_id: string | null;
  resend_source_dispatch_id: string | null;
  sent_at: string | null;
  error_summary: string | null;
  automatic_outcome: string | null;
  primary_order_email: string | null;
  qualifying_order_count: number;
  globally_enabled: boolean;
  cutoff_passed: boolean;
  has_successful_primary_send: boolean;
}): ProviderPrimaryDispatchStatusRow {
  return {
    providerId: row.provider_id,
    scheduledDeliveryDate: row.scheduled_delivery_date,
    latestStatus: row.latest_status,
    latestDispatchId: row.latest_dispatch_id,
    resendSourceDispatchId: row.resend_source_dispatch_id,
    sentAt: row.sent_at,
    errorSummary: row.error_summary,
    automaticOutcome: row.automatic_outcome,
    primaryOrderEmail: row.primary_order_email,
    qualifyingOrderCount: row.qualifying_order_count,
    globallyEnabled: row.globally_enabled,
    cutoffPassed: row.cutoff_passed,
    hasSuccessfulPrimarySend: row.has_successful_primary_send,
  };
}

export function buildProviderPrimaryEmailStatusLabel(
  status: ProviderPrimaryDispatchStatusRow,
): string {
  if (!status.globallyEnabled) {
    return "Provider email disabled in settings";
  }

  if (status.qualifyingOrderCount === 0) {
    if (status.automaticOutcome === "no_orders") {
      return "No qualifying orders — email not sent";
    }
    return "No qualifying orders";
  }

  if (!status.primaryOrderEmail?.trim()) {
    if (status.automaticOutcome === "email_missing") {
      return "Provider order email not configured";
    }
    return "Provider order email missing";
  }

  if (!status.cutoffPassed) {
    return "Scheduled after ordering cutoff";
  }

  switch (status.latestStatus) {
    case "sent":
      return "Provider order email sent";
    case "pending":
      return "Provider order email sending…";
    case "failed":
      return "Provider order email failed";
    case "attention_required":
      return "Provider order email needs review";
    default:
      if (status.automaticOutcome === "no_orders") {
        return "No qualifying orders — email not sent";
      }
      if (status.automaticOutcome === "email_missing") {
        return "Provider order email not configured";
      }
      return "Provider order email pending send";
  }
}

export function canHrSendPrimaryProviderEmail(status: ProviderPrimaryDispatchStatusRow): boolean {
  if (!status.cutoffPassed || status.qualifyingOrderCount === 0) {
    return false;
  }
  if (!status.primaryOrderEmail?.trim()) {
    return false;
  }
  if (status.latestStatus === "pending" || status.latestStatus === "attention_required") {
    return false;
  }
  if (status.hasSuccessfulPrimarySend) {
    return false;
  }
  return status.latestStatus !== "sent";
}

export function canHrResendPrimaryProviderEmail(status: ProviderPrimaryDispatchStatusRow): boolean {
  if (!status.cutoffPassed || status.qualifyingOrderCount === 0) {
    return false;
  }
  if (!status.primaryOrderEmail?.trim()) {
    return false;
  }
  if (status.latestStatus === "pending" || status.latestStatus === "attention_required") {
    return false;
  }
  return status.latestStatus === "sent" || status.latestStatus === "failed";
}

export const PRIMARY_PROVIDER_RESEND_CONFIRMATION =
  "This provider order may already have been received. Resending can result in duplicate preparation. Continue?";
