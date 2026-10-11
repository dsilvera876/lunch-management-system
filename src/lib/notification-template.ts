import {
  buildEmailHtmlList,
  emailHtmlValueOrEmpty,
  type TrustedEmailHtml,
} from "@/lib/email-html";

const VARIABLE_PATTERN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

/** Plain-text values for subjects and text bodies. Never HTML-escaped. */
export type NotificationTemplateVariables = Record<string, string>;

/**
 * Values for HTML bodies. Strings are always HTML-escaped; only
 * `TrustedEmailHtml` fragments built by `@/lib/email-html` are inserted as markup.
 */
export type NotificationHtmlTemplateVariables = Record<string, string | TrustedEmailHtml>;

export function extractNotificationTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found].sort();
}

export function validateNotificationTemplateVariables(
  allowedVariables: readonly string[],
  subject: string,
  bodyHtml: string,
  bodyText?: string | null,
): string[] {
  const allowed = new Set(allowedVariables.map((v) => v.toLowerCase()));
  const used = extractNotificationTemplateVariables(
    `${subject}\n${bodyHtml}\n${bodyText ?? ""}`,
  );

  return used.filter((name) => !allowed.has(name));
}

function replaceTemplateVariables(
  template: string,
  resolve: (key: string) => string,
): string {
  return template.replace(VARIABLE_PATTERN, (_match, rawName: string) =>
    resolve(rawName.toLowerCase()),
  );
}

export function renderNotificationTextTemplate(
  template: string,
  variables: NotificationTemplateVariables,
): string {
  return replaceTemplateVariables(template, (key) => variables[key] ?? "");
}

export function renderNotificationSubjectTemplate(
  template: string,
  variables: NotificationTemplateVariables,
): string {
  return renderNotificationTextTemplate(template, variables).replace(/[\r\n]+/g, " ");
}

export function renderNotificationHtmlTemplate(
  template: string,
  variables: NotificationHtmlTemplateVariables,
): string {
  return replaceTemplateVariables(template, (key) => emailHtmlValueOrEmpty(variables[key]));
}

export const TODAY_MENU_SAMPLE_TEXT_VARIABLES: NotificationTemplateVariables = {
  first_name: "Alex",
  menu_date: "Mon, Sep 14, 2026",
  provider_name: "Island Eats",
  mains: "- Jerk Chicken\n- Curry Fish\n- Vegetable Pasta (V)",
  sides: "- Rice and Peas\n- Steamed Vegetables\n- Garden Salad",
  ordering_deadline: "11:00 AM",
  order_url: "https://example.com/lunch",
};

export const TODAY_MENU_SAMPLE_HTML_VARIABLES: NotificationHtmlTemplateVariables = {
  ...TODAY_MENU_SAMPLE_TEXT_VARIABLES,
  mains: buildEmailHtmlList(["Jerk Chicken", "Curry Fish", "Vegetable Pasta (V)"]),
  sides: buildEmailHtmlList(["Rice and Peas", "Steamed Vegetables", "Garden Salad"]),
};

export const STAFF_ORDER_SAMPLE_VARIABLES: NotificationTemplateVariables = {
  first_name: "Alex",
  order_date: "Mon, Sep 14, 2026",
  provider_name: "Island Eats",
  order_summary: "Jerk Chicken × 1\nRice and Peas × 1",
  order_total: "$12.00",
  order_url: "https://example.com/lunch/orders/sample",
  reorder_message:
    "If ordering is still open, you can place another order here:\nhttps://example.com/lunch",
};
