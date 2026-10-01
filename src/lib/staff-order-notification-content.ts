import type { SupabaseClient } from "@supabase/supabase-js";

import { formatCurrency, formatHumanDate } from "@/lib/format";
import { formatOrderLineLabel } from "@/lib/menu-items";
import {
  renderNotificationTemplate,
  type NotificationTemplateVariables,
} from "@/lib/notification-template";
import { firstNameFromFullName } from "@/lib/today-menu-notification-content";

export type StaffOrderNotificationContext = {
  eventKey: string;
  orderId: string;
  orderDate: string;
  providerName: string;
  orderSummary: string;
  orderTotal: number;
  orderStatus: string;
  orderingStillOpen: boolean;
  recipientName: string;
  recipientEmail: string;
};

export function buildStaffOrderUrl(appOrigin: string, orderId: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}/lunch/orders/${orderId}`;
}

export function formatStaffOrderSummaryFromItems(
  items: Array<{
    name: string;
    unit_label: string | null;
    quantity: number;
    item_type: string;
  }>,
): string {
  const typeOrder: Record<string, number> = { main: 0, side: 1, standalone: 2 };
  const sorted = [...items].sort((a, b) => {
    const ta = typeOrder[a.item_type] ?? 3;
    const tb = typeOrder[b.item_type] ?? 3;
    if (ta !== tb) {
      return ta - tb;
    }
    return a.name.localeCompare(b.name);
  });

  return sorted
    .map((item) =>
      formatOrderLineLabel(item.name, item.unit_label, item.quantity),
    )
    .join("\n");
}

export function buildStaffOrderCancelReorderMessage(
  orderingStillOpen: boolean,
  orderUrl: string,
): string {
  if (!orderingStillOpen) {
    return "";
  }

  return `If ordering is still open, you can place another order here:\n${orderUrl}`;
}

export function buildStaffOrderTemplateVariables(
  context: StaffOrderNotificationContext,
  appOrigin: string,
): NotificationTemplateVariables {
  const firstName = firstNameFromFullName(
    context.recipientName,
    context.recipientEmail,
  );
  const orderUrl = buildStaffOrderUrl(appOrigin, context.orderId);
  const reorderMessage = buildStaffOrderCancelReorderMessage(
    context.orderingStillOpen,
    orderUrl,
  );

  return {
    first_name: firstName,
    order_date: formatHumanDate(context.orderDate),
    provider_name: context.providerName,
    order_summary: context.orderSummary,
    order_total: formatCurrency(context.orderTotal),
    order_url: orderUrl,
    reorder_message: reorderMessage,
  };
}

export function buildStaffOrderRenderedEmail(
  context: StaffOrderNotificationContext,
  appOrigin: string,
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): { subject: string; textBody: string; htmlBody: string } {
  const variables = buildStaffOrderTemplateVariables(context, appOrigin);

  return {
    subject: renderNotificationTemplate(templates.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(templates.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(
      templates.bodyTextTemplate || templates.bodyHtmlTemplate,
      variables,
    ),
  };
}

type PendingStaffOrderDeliveryRow = {
  delivery_id: string;
  event_key: string;
  order_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

type OrderContextRow = {
  provider_name: string;
  order_summary: string;
  order_total: number;
  order_status: string;
  ordering_still_open: boolean;
};

export async function loadStaffOrderNotificationContext(
  supabase: SupabaseClient,
  row: PendingStaffOrderDeliveryRow,
): Promise<StaffOrderNotificationContext | null> {
  const { data, error } = await supabase.rpc("worker_get_staff_order_notification_context", {
    p_order_id: row.order_id,
  });

  if (error) {
    throw new Error(`Staff order context load failed: ${error.message}`);
  }

  const contextRow = (data as OrderContextRow[] | null)?.[0];
  if (!contextRow) {
    return null;
  }

  return {
    eventKey: row.event_key,
    orderId: row.order_id,
    orderDate: row.operational_date,
    providerName: String(contextRow.provider_name),
    orderSummary: String(contextRow.order_summary),
    orderTotal: Number(contextRow.order_total),
    orderStatus: String(contextRow.order_status),
    orderingStillOpen: Boolean(contextRow.ordering_still_open),
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
  };
}

export type { PendingStaffOrderDeliveryRow };
