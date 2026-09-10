import { JAMAICA_TIME_ZONE } from "./datetime";

export type LateOrderDeadlineDay = "order_day" | "delivery_day";
export type SupplementalDispatchMode = "manual" | "automatic";

export type ProviderLateOrderSettings = {
  acceptsLateOrders: boolean;
  lateOrderDeadlineDay: LateOrderDeadlineDay | null;
  lateOrderDeadlineTime: string | null;
  supplementalDispatchMode: SupplementalDispatchMode;
  automaticSupplementSendDay: LateOrderDeadlineDay | null;
  automaticSupplementSendTime: string | null;
  primaryOrderEmail: string | null;
};

export function isValidProviderOrderEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function parseTimeValue(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ?? "00";

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}

export function formatLateOrderTimeLabel(time: string | null): string {
  if (!time) {
    return "—";
  }

  const [hours, minutes] = time.split(":");
  const date = new Date(`1970-01-01T${hours}:${minutes}:00`);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export function providerLateOrderAnchorAt(
  anchorDay: LateOrderDeadlineDay,
  anchorTime: string,
  orderDate: string,
  deliveryDate: string,
): Date {
  const anchorDate = anchorDay === "order_day" ? orderDate : deliveryDate;
  return new Date(`${anchorDate}T${anchorTime}-05:00`);
}

export function isProviderLateOrderingOpen(
  settings: Pick<
    ProviderLateOrderSettings,
    "acceptsLateOrders" | "lateOrderDeadlineDay" | "lateOrderDeadlineTime"
  >,
  orderDate: string,
  deliveryDate: string,
  now: Date,
  companyCutoffPassed: boolean,
): boolean {
  if (!settings.acceptsLateOrders || !settings.lateOrderDeadlineDay || !settings.lateOrderDeadlineTime) {
    return false;
  }

  if (!companyCutoffPassed) {
    return false;
  }

  const deadline = providerLateOrderAnchorAt(
    settings.lateOrderDeadlineDay,
    settings.lateOrderDeadlineTime,
    orderDate,
    deliveryDate,
  );

  return now.getTime() <= deadline.getTime();
}

export function validateAutomaticSupplementSchedule(
  settings: ProviderLateOrderSettings,
  sampleOrderDate: string,
  sampleDeliveryDate: string,
): string | null {
  if (settings.supplementalDispatchMode !== "automatic") {
    return null;
  }

  if (
    !settings.automaticSupplementSendDay ||
    !settings.automaticSupplementSendTime ||
    !settings.lateOrderDeadlineDay ||
    !settings.lateOrderDeadlineTime
  ) {
    return "Automatic supplement schedule is incomplete.";
  }

  const sendAt = providerLateOrderAnchorAt(
    settings.automaticSupplementSendDay,
    settings.automaticSupplementSendTime,
    sampleOrderDate,
    sampleDeliveryDate,
  );
  const deadline = providerLateOrderAnchorAt(
    settings.lateOrderDeadlineDay,
    settings.lateOrderDeadlineTime,
    sampleOrderDate,
    sampleDeliveryDate,
  );

  if (sendAt.getTime() > deadline.getTime()) {
    return "Automatic supplement send time must be on or before the late-order deadline.";
  }

  return null;
}

export function formatAutomaticSupplementScheduleLabel(
  settings: Pick<
    ProviderLateOrderSettings,
    | "supplementalDispatchMode"
    | "automaticSupplementSendDay"
    | "automaticSupplementSendTime"
  >,
): string | null {
  if (settings.supplementalDispatchMode !== "automatic" || !settings.automaticSupplementSendTime) {
    return null;
  }

  const dayLabel = settings.automaticSupplementSendDay === "delivery_day" ? "delivery day" : "order day";
  return `Automatic supplement: ${formatLateOrderTimeLabel(settings.automaticSupplementSendTime)} on ${dayLabel}`;
}

export type SupplementDispatchRecord = {
  status: string;
  dispatchType: string;
  sentAt: string | null;
  errorSummary: string | null;
  createdAt: string;
};

export type AutomaticOpportunityRecord = {
  outcome: string;
  processedAt: string;
  lateOrderCount: number;
};

export function isAutomaticSupplementDue(
  settings: Pick<
    ProviderLateOrderSettings,
    | "supplementalDispatchMode"
    | "automaticSupplementSendDay"
    | "automaticSupplementSendTime"
    | "lateOrderDeadlineDay"
    | "lateOrderDeadlineTime"
  >,
  orderDate: string,
  deliveryDate: string,
  now: Date,
): boolean {
  if (
    settings.supplementalDispatchMode !== "automatic" ||
    !settings.automaticSupplementSendDay ||
    !settings.automaticSupplementSendTime ||
    !settings.lateOrderDeadlineDay ||
    !settings.lateOrderDeadlineTime
  ) {
    return false;
  }

  const sendAt = providerLateOrderAnchorAt(
    settings.automaticSupplementSendDay,
    settings.automaticSupplementSendTime,
    orderDate,
    deliveryDate,
  );
  const deadline = providerLateOrderAnchorAt(
    settings.lateOrderDeadlineDay,
    settings.lateOrderDeadlineTime,
    orderDate,
    deliveryDate,
  );

  return now.getTime() >= sendAt.getTime() && now.getTime() <= deadline.getTime();
}

export function formatSupplementDispatchStatusLabel(input: {
  dispatchMode: SupplementalDispatchMode;
  approvedUnsentCount: number;
  lateOrderingOpen: boolean;
  automaticDue: boolean;
  snapshotMissing: boolean;
  latestDispatch: SupplementDispatchRecord | null;
  automaticOpportunity: AutomaticOpportunityRecord | null;
  now: Date;
}): string {
  if (input.snapshotMissing) {
    return "Menu snapshot missing for this order cycle";
  }

  if (input.latestDispatch?.status === "attention_required") {
    return "Dispatch requires review";
  }

  if (input.latestDispatch?.status === "pending") {
    return "Dispatch in progress";
  }

  if (input.latestDispatch?.status === "failed") {
    return "Failed — retry available";
  }

  if (input.latestDispatch?.status === "sent" && input.latestDispatch.sentAt) {
    const sentLabel = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: JAMAICA_TIME_ZONE,
    }).format(new Date(input.latestDispatch.sentAt));
    return `Sent at ${sentLabel}`;
  }

  if (input.dispatchMode === "automatic") {
    if (input.automaticOpportunity?.outcome === "no_orders") {
      return "Automatic send processed — no orders";
    }

    if (input.automaticOpportunity?.outcome === "sent") {
      if (input.approvedUnsentCount > 0) {
        return "Automatic send completed — manual send required for new orders";
      }
      return "Automatic send processed";
    }

    if (input.automaticOpportunity?.outcome === "failed") {
      return "Automatic send failed — manual retry available";
    }

    if (input.automaticOpportunity?.outcome === "attention_required") {
      return "Dispatch requires review";
    }

    if (input.approvedUnsentCount === 0) {
      return "No late orders to send";
    }

    if (!input.lateOrderingOpen && input.approvedUnsentCount > 0) {
      return "Automatic window missed";
    }

    if (input.automaticDue) {
      return "Scheduled";
    }

    return "Scheduled";
  }

  return "Manual supplemental sending";
}

export function canSendOutstandingSupplement(input: {
  approvedUnsentCount: number;
  primaryOrderEmail: string | null;
  lateOrderingOpen: boolean;
  hasBlockingDispatch: boolean;
}): boolean {
  return (
    input.approvedUnsentCount > 0 &&
    Boolean(input.primaryOrderEmail?.trim()) &&
    input.lateOrderingOpen &&
    !input.hasBlockingDispatch
  );
}

export function buildSupplementalEmailSubject(input: {
  providerName: string;
  deliveryDate: string;
}): string {
  return `SUPPLEMENTAL LATE ORDERS — ${input.providerName} — ${input.deliveryDate}`;
}

export type SupplementalEmailOrder = {
  employeeName: string;
  officeLocationName: string;
  orderLines: string[];
  quantityLines: string[];
  specialInstructions: string | null;
};

export function buildSupplementalEmailBody(input: {
  providerName: string;
  deliveryDate: string;
  ordersByOffice: Array<{
    officeName: string;
    orders: SupplementalEmailOrder[];
  }>;
}): string {
  const lines = [
    "These orders are in addition to previously submitted orders.",
    "",
    `Provider: ${input.providerName}`,
    `Scheduled delivery: ${input.deliveryDate}`,
    "",
  ];

  for (const office of input.ordersByOffice) {
    lines.push(office.officeName.toUpperCase());
    lines.push("");

    for (const order of office.orders) {
      lines.push(order.employeeName);

      for (let index = 0; index < order.orderLines.length; index += 1) {
        const itemLine = order.orderLines[index];
        const qty = order.quantityLines[index] ?? "";
        lines.push(`  ${itemLine}${qty ? ` (${qty})` : ""}`);
      }

      if (order.specialInstructions) {
        lines.push(`  Notes: ${order.specialInstructions}`);
      }

      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function assertSupplementalEmailPayloadSafe(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const forbidden = ["email", "role", "subsidy", "payroll", "net_deduction", "unit_price", "profile_id"];
  const json = JSON.stringify(payload).toLowerCase();

  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Supplemental email payload must not include ${key}`);
    }
  }
}

export function getJamaicaNow(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}-05:00`,
  );
}
