const VARIABLE_PATTERN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export type NotificationTemplateVariables = Record<string, string>;

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

export function renderNotificationTemplate(
  template: string,
  variables: NotificationTemplateVariables,
): string {
  return template.replace(VARIABLE_PATTERN, (_match, rawName: string) => {
    const key = rawName.toLowerCase();
    return variables[key] ?? "";
  });
}

export const TODAY_MENU_SAMPLE_VARIABLES: NotificationTemplateVariables = {
  first_name: "Alex",
  menu_date: "Mon, Sep 14, 2026",
  provider_name: "Island Eats",
  mains: "<ul><li>Jerk Chicken</li><li>Curry Fish</li><li>Vegetable Pasta (V)</li></ul>",
  sides: "<ul><li>Rice and Peas</li><li>Steamed Vegetables</li><li>Garden Salad</li></ul>",
  ordering_deadline: "11:00 AM",
  order_url: "https://example.com/lunch",
};

export const TODAY_MENU_SAMPLE_TEXT_VARIABLES: NotificationTemplateVariables = {
  ...TODAY_MENU_SAMPLE_VARIABLES,
  mains: "- Jerk Chicken\n- Curry Fish\n- Vegetable Pasta (V)",
  sides: "- Rice and Peas\n- Steamed Vegetables\n- Garden Salad",
};
