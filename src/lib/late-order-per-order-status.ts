export type LateOrderRowDispatchDisplay =
  | { kind: "sent"; sentAt: string | null }
  | { kind: "approved_unsent" }
  | { kind: "pending" }
  | { kind: "attention_required" }
  | { kind: "failed" };

export type LateOrderDispatchMembershipRow = {
  orderId: string;
  dispatchStatus: string;
  sentAt: string | null;
};

export type LateOrderDispatchSummaryRow = {
  status: string;
  messageMetadata: unknown;
};

export function extractOrderIdsFromDispatchMetadata(messageMetadata: unknown): string[] {
  if (!messageMetadata || typeof messageMetadata !== "object") {
    return [];
  }

  const orderIds = (messageMetadata as { order_ids?: unknown }).order_ids;

  if (!Array.isArray(orderIds)) {
    return [];
  }

  return orderIds.filter((value): value is string => typeof value === "string");
}

export function buildSentLateOrderDispatchMap(
  rows: LateOrderDispatchMembershipRow[],
): Map<string, string | null> {
  const sentByOrderId = new Map<string, string | null>();

  for (const row of rows) {
    if (row.dispatchStatus !== "sent") {
      continue;
    }

    const existing = sentByOrderId.get(row.orderId);

    if (!existing) {
      sentByOrderId.set(row.orderId, row.sentAt);
      continue;
    }

    if (row.sentAt && (!existing || row.sentAt > existing)) {
      sentByOrderId.set(row.orderId, row.sentAt);
    }
  }

  return sentByOrderId;
}

export function resolveLateOrderRowDispatchDisplay(
  orderId: string,
  sentByOrderId: Map<string, string | null>,
  dispatches: LateOrderDispatchSummaryRow[],
): LateOrderRowDispatchDisplay {
  const sentAt = sentByOrderId.get(orderId);

  if (sentAt !== undefined) {
    return { kind: "sent", sentAt };
  }

  for (const dispatch of dispatches) {
    const orderIds = extractOrderIdsFromDispatchMetadata(dispatch.messageMetadata);

    if (!orderIds.includes(orderId)) {
      continue;
    }

    if (dispatch.status === "pending") {
      return { kind: "pending" };
    }

    if (dispatch.status === "attention_required") {
      return { kind: "attention_required" };
    }

    if (dispatch.status === "failed") {
      return { kind: "failed" };
    }
  }

  return { kind: "approved_unsent" };
}

export function isLateOrderEligibleForSupplementSend(
  display: LateOrderRowDispatchDisplay,
): boolean {
  return display.kind === "approved_unsent" || display.kind === "failed";
}

/** Orders HR can include in the next supplemental send (matches claim eligibility, excluding in-flight/review). */
export function countEligibleLateOrdersForSupplementSend(
  orderIds: string[],
  sentByOrderId: Map<string, string | null>,
  dispatches: LateOrderDispatchSummaryRow[],
): number {
  return orderIds.filter((orderId) => {
    const display = resolveLateOrderRowDispatchDisplay(orderId, sentByOrderId, dispatches);
    return isLateOrderEligibleForSupplementSend(display);
  }).length;
}

/** @deprecated Use countEligibleLateOrdersForSupplementSend — counts send-eligible orders only. */
export function countApprovedUnsentLateOrders(
  orderIds: string[],
  sentByOrderId: Map<string, string | null>,
  dispatches: LateOrderDispatchSummaryRow[] = [],
): number {
  return countEligibleLateOrdersForSupplementSend(orderIds, sentByOrderId, dispatches);
}

export function formatLateOrderRowDispatchLabel(display: LateOrderRowDispatchDisplay): string {
  switch (display.kind) {
    case "sent":
      return "Sent";
    case "pending":
      return "Sending…";
    case "attention_required":
      return "Needs review";
    case "failed":
      return "Send failed";
    default:
      return "Approved — not sent";
  }
}
