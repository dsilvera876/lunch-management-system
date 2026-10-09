import type { UserRole } from "@/lib/roles";

export const OPERATIONAL_ATTENTION_EVENT_KEYS = [
  "hr.pending_signup_approval",
  "hr.late_order_submitted",
  "hr.email_delivery_failure",
  "admin.email_delivery_failure",
] as const;

export type OperationalAttentionEventKey =
  (typeof OPERATIONAL_ATTENTION_EVENT_KEYS)[number];

export const OPERATIONAL_ATTENTION_INBOX_ROLES = [
  "hr",
  "admin",
  "owner",
] as const;

export type OperationalAttentionInboxRole =
  (typeof OPERATIONAL_ATTENTION_INBOX_ROLES)[number];

export type OperationalAttentionInboxRow = {
  id: string;
  event_key: string;
  title: string;
  body: string;
  action_href: string;
  read_at: string | null;
  created_at: string;
};

export type OperationalAttentionItem = {
  id: string;
  eventKey: OperationalAttentionEventKey;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
  readAt: string | null;
  createdAt: string;
  isUnread: boolean;
};

export function canAccessOperationalAttentionInbox(
  role: string,
): role is OperationalAttentionInboxRole {
  return (OPERATIONAL_ATTENTION_INBOX_ROLES as readonly string[]).includes(role);
}

export function isOperationalAttentionEventKey(
  value: string,
): value is OperationalAttentionEventKey {
  return (OPERATIONAL_ATTENTION_EVENT_KEYS as readonly string[]).includes(value);
}

export function operationalAttentionActionLabel(
  eventKey: OperationalAttentionEventKey,
): string {
  switch (eventKey) {
    case "hr.pending_signup_approval":
      return "Review approvals";
    case "hr.late_order_submitted":
      return "Review late order";
    case "hr.email_delivery_failure":
      return "Open workflow";
    case "admin.email_delivery_failure":
      return "Review delivery";
    default:
      return "Open";
  }
}

export function mapOperationalAttentionRow(
  row: OperationalAttentionInboxRow,
): OperationalAttentionItem | null {
  if (!isOperationalAttentionEventKey(row.event_key)) {
    return null;
  }

  return {
    id: row.id,
    eventKey: row.event_key,
    title: row.title,
    body: row.body,
    actionHref: row.action_href,
    actionLabel: operationalAttentionActionLabel(row.event_key),
    readAt: row.read_at,
    createdAt: row.created_at,
    isUnread: row.read_at === null,
  };
}

export function mapOperationalAttentionRows(
  rows: OperationalAttentionInboxRow[],
): OperationalAttentionItem[] {
  const items: OperationalAttentionItem[] = [];

  for (const row of rows) {
    const mapped = mapOperationalAttentionRow(row);
    if (mapped) {
      items.push(mapped);
    }
  }

  return items;
}

export function operationalAttentionBellAriaLabel(unreadCount: number): string {
  if (unreadCount <= 0) {
    return "Notifications";
  }

  const noun = unreadCount === 1 ? "unread notification" : "unread notifications";
  return `Notifications, ${unreadCount} ${noun}`;
}

export function shouldShowOperationalAttentionBell(role: UserRole | string): boolean {
  return canAccessOperationalAttentionInbox(role);
}
