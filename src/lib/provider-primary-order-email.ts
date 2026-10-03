import { getDeliveryDisplayLinePairs } from "@/lib/deliveries";
import {
  assertProviderPrintPayloadSafe,
  buildOperationalDeliveryReport,
  groupOperationalOrdersByProvider,
  type OperationalOrder,
  type ProviderOperationalGroup,
} from "@/lib/operational-orders";

export function escapeProviderEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPrimaryProviderEmailSubject(input: {
  providerName: string;
  deliveryDate: string;
}): string {
  return `Lunch order — ${input.providerName} — ${input.deliveryDate}`;
}

export type PrimaryProviderEmailPayload = {
  providerName: string;
  deliveryDate: string;
  providerGroup: ProviderOperationalGroup;
};

export type PrimaryProviderEmailSnapshot = PrimaryProviderEmailPayload;

export function serializePrimaryProviderEmailSnapshot(
  payload: PrimaryProviderEmailPayload,
): PrimaryProviderEmailSnapshot {
  return payload;
}

export function parsePrimaryProviderEmailSnapshot(
  value: unknown,
): PrimaryProviderEmailSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const providerName = record.providerName;
  const deliveryDate = record.deliveryDate;
  const providerGroup = record.providerGroup;

  if (typeof providerName !== "string" || typeof deliveryDate !== "string") {
    return null;
  }

  if (!providerGroup || typeof providerGroup !== "object") {
    return null;
  }

  const group = providerGroup as ProviderOperationalGroup;
  if (typeof group.providerId !== "string" || !Array.isArray(group.offices)) {
    return null;
  }

  return {
    providerName,
    deliveryDate,
    providerGroup: group,
  };
}

export function buildPrimaryProviderEmailPayload(
  orders: OperationalOrder[],
  input: {
    providerId: string;
    providerName: string;
    deliveryDate: string;
  },
): PrimaryProviderEmailPayload | null {
  const report = buildOperationalDeliveryReport(orders, input.deliveryDate);
  const providerGroup = report.providers.find((p) => p.providerId === input.providerId);

  if (!providerGroup || providerGroup.offices.length === 0) {
    return null;
  }

  const payload = {
    providerName: input.providerName,
    deliveryDate: input.deliveryDate,
    providerGroup,
  };

  assertProviderPrintPayloadSafe({
    provider: payload.providerName,
    deliveryDate: payload.deliveryDate,
    offices: providerGroup.offices.map((office) => ({
      name: office.name,
      orders: office.orders.map((order) => ({
        employeeName: order.employeeName,
        officeLocationName: order.officeLocationName,
        specialInstructions: order.specialInstructions,
        items: order.items,
      })),
    })),
  });

  return payload;
}

export function buildPrimaryProviderEmailText(payload: PrimaryProviderEmailPayload): string {
  const lines = [
    "Daily lunch order",
    "",
    `Provider: ${payload.providerName}`,
    `Delivery date: ${payload.deliveryDate}`,
    "",
  ];

  for (const section of payload.providerGroup.preparationSections) {
    lines.push(section.label.toUpperCase());
    for (const line of section.lines) {
      const unit =
        line.unitLabel && line.unitLabel !== "Each" ? ` (${line.unitLabel})` : "";
      lines.push(`  ${line.name}${unit} ×${line.quantity}`);
    }
    lines.push("");
  }

  for (const office of payload.providerGroup.offices) {
    lines.push(office.name.toUpperCase());
    lines.push("");

    for (const order of office.orders) {
      lines.push(order.employeeName);
      const pairs = getDeliveryDisplayLinePairs(order);
      for (let index = 0; index < pairs.orderLines.length; index += 1) {
        const itemLine = pairs.orderLines[index];
        const qty = pairs.quantityLines[index] ?? "";
        lines.push(`  ${itemLine}${qty ? ` (${qty})` : ""}`);
      }
      if (order.specialInstructions) {
        lines.push(`  Notes: ${order.specialInstructions}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function buildPrimaryProviderEmailHtml(payload: PrimaryProviderEmailPayload): string {
  const providerName = escapeProviderEmailHtml(payload.providerName);
  const deliveryDate = escapeProviderEmailHtml(payload.deliveryDate);

  const prepSections = payload.providerGroup.preparationSections
    .map((section) => {
      const items = section.lines
        .map((line) => {
          const unit =
            line.unitLabel && line.unitLabel !== "Each"
              ? ` (${escapeProviderEmailHtml(line.unitLabel)})`
              : "";
          return `<li>${escapeProviderEmailHtml(line.name)}${unit} ×${line.quantity}</li>`;
        })
        .join("");
      return `<h3>${escapeProviderEmailHtml(section.label)}</h3><ul>${items}</ul>`;
    })
    .join("");

  const officeBlocks = payload.providerGroup.offices
    .map((office) => {
      const orders = office.orders
        .map((order) => {
          const pairs = getDeliveryDisplayLinePairs(order);
          const itemLines = pairs.orderLines
            .map((itemLine, index) => {
              const qty = pairs.quantityLines[index] ?? "";
              const qtySuffix = qty ? ` (${escapeProviderEmailHtml(qty)})` : "";
              return `<li>${escapeProviderEmailHtml(itemLine)}${qtySuffix}</li>`;
            })
            .join("");
          const notes = order.specialInstructions
            ? `<p><em>Notes: ${escapeProviderEmailHtml(order.specialInstructions)}</em></p>`
            : "";
          return `<div class="order"><p><strong>${escapeProviderEmailHtml(order.employeeName)}</strong></p><ul>${itemLines}</ul>${notes}</div>`;
        })
        .join("");
      return `<h3>${escapeProviderEmailHtml(office.name)}</h3>${orders}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family: system-ui, sans-serif; color: #111; line-height: 1.45;">
  <h1 style="font-size: 1.25rem;">Daily lunch order</h1>
  <p><strong>Provider:</strong> ${providerName}<br/>
  <strong>Delivery date:</strong> ${deliveryDate}</p>
  ${prepSections}
  ${officeBlocks}
</body>
</html>`;
}

/** Validates every order belongs to the expected provider (defense in depth). */
export function assertPrimaryOrdersProviderScoped(
  orders: OperationalOrder[],
  providerId: string,
  deliveryDate: string,
): void {
  for (const order of orders) {
    if (order.providerId !== providerId || order.deliveryDate !== deliveryDate) {
      throw new Error("Primary provider email orders are not scoped to provider and delivery date.");
    }
    if (order.isLateOrder) {
      throw new Error("Late orders must not be included in primary provider email.");
    }
  }
}

export function groupOperationalOrdersForPrimaryEmail(
  orders: OperationalOrder[],
  deliveryDate: string,
): ReturnType<typeof groupOperationalOrdersByProvider> {
  return buildOperationalDeliveryReport(orders, deliveryDate).providers;
}
