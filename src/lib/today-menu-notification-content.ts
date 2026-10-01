import type { SupabaseClient } from "@supabase/supabase-js";
import { getJamaicaIsoWeekday, type Weekday } from "@/lib/datetime";
import { renderNotificationTemplate } from "@/lib/notification-template";
import {
  loadProviderMenusForOrderDate,
  type ProviderMenuBundle,
} from "@/lib/staff-provider-menu";
import type { MenuItemType } from "@/lib/menu-items";

export type TodayMenuRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

function formatMenuDateLabel(orderDate: string): string {
  const date = new Date(`${orderDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Jamaica",
  }).format(date);
}

function formatOrderingDeadline(deadlineIso: string): string {
  const date = new Date(deadlineIso);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Jamaica",
  }).format(date);
}

function listItemsHtml(items: Array<{ name: string }>): string {
  if (items.length === 0) {
    return "<p>—</p>";
  }

  const lines = items.map((item) => `<li>${item.name}</li>`).join("");
  return `<ul>${lines}</ul>`;
}

function listItemsText(items: Array<{ name: string }>): string {
  if (items.length === 0) {
    return "—";
  }

  return items.map((item) => `- ${item.name}`).join("\n");
}

function itemsByType(
  menuItems: ProviderMenuBundle["menuItems"],
  type: MenuItemType,
): Array<{ name: string }> {
  return menuItems
    .filter((item) => item.itemType === type || (type === "main" && item.itemType === "standalone"))
    .map((item) => ({ name: item.name }));
}

function buildProviderSections(providers: ProviderMenuBundle[]): {
  providerName: string;
  mainsHtml: string;
  sidesHtml: string;
  mainsText: string;
  sidesText: string;
} {
  if (providers.length === 1) {
    const provider = providers[0]!;
    const mains = itemsByType(provider.menuItems, "main");
    const sides = [
      ...itemsByType(provider.menuItems, "side"),
      ...itemsByType(provider.menuItems, "standalone").filter(
        (item) => !mains.some((main) => main.name === item.name),
      ),
    ];

    return {
      providerName: provider.name,
      mainsHtml: listItemsHtml(mains),
      sidesHtml: listItemsHtml(sides),
      mainsText: listItemsText(mains),
      sidesText: listItemsText(sides),
    };
  }

  const providerName = providers.map((provider) => provider.name).join(", ");
  const mainsHtml = providers
    .map((provider) => {
      const mains = itemsByType(provider.menuItems, "main");
      return `<p><strong>${provider.name}</strong></p>${listItemsHtml(mains)}`;
    })
    .join("");
  const sidesHtml = providers
    .map((provider) => {
      const sides = [
        ...itemsByType(provider.menuItems, "side"),
        ...itemsByType(provider.menuItems, "standalone"),
      ];
      return `<p><strong>${provider.name}</strong></p>${listItemsHtml(sides)}`;
    })
    .join("");

  const mainsText = providers
    .map((provider) => {
      const mains = itemsByType(provider.menuItems, "main");
      return `${provider.name}:\n${listItemsText(mains)}`;
    })
    .join("\n\n");
  const sidesText = providers
    .map((provider) => {
      const sides = [
        ...itemsByType(provider.menuItems, "side"),
        ...itemsByType(provider.menuItems, "standalone"),
      ];
      return `${provider.name}:\n${listItemsText(sides)}`;
    })
    .join("\n\n");

  return { providerName, mainsHtml, sidesHtml, mainsText, sidesText };
}

export async function buildTodayMenuRenderedEmail(
  supabase: SupabaseClient,
  input: {
    orderDate: string;
    firstName: string;
    appOrigin: string;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): Promise<TodayMenuRenderedEmail | null> {
  const orderWeekday = getJamaicaIsoWeekday(input.orderDate) as Weekday | null;
  if (!orderWeekday) {
    return null;
  }

  const providers = await loadProviderMenusForOrderDate(
    supabase,
    input.orderDate,
    orderWeekday,
  );

  if (providers.length === 0) {
    return null;
  }

  const { data: orderDeadline } = await supabase.rpc("order_deadline_for_order_date", {
    p_order_date: input.orderDate,
  });

  if (!orderDeadline) {
    return null;
  }

  const sections = buildProviderSections(providers);
  const orderUrl = `${input.appOrigin.replace(/\/$/, "")}/lunch`;

  const variables = {
    first_name: input.firstName,
    menu_date: formatMenuDateLabel(input.orderDate),
    provider_name: sections.providerName,
    mains: sections.mainsHtml,
    sides: sections.sidesHtml,
    ordering_deadline: formatOrderingDeadline(String(orderDeadline)),
    order_url: orderUrl,
  };

  const textVariables = {
    ...variables,
    mains: sections.mainsText,
    sides: sections.sidesText,
  };

  return {
    subject: renderNotificationTemplate(input.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(input.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(input.bodyTextTemplate, textVariables),
  };
}

export function firstNameFromFullName(fullName: string | null, email: string): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    return trimmed.split(/\s+/)[0] ?? trimmed;
  }

  return email.split("@")[0] ?? "there";
}
