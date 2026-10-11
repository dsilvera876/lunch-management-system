import type { SupabaseClient } from "@supabase/supabase-js";
import { getJamaicaIsoWeekday, type Weekday } from "@/lib/datetime";
import {
  buildEmailHtmlList,
  emailHtml,
  joinEmailHtml,
  type TrustedEmailHtml,
} from "@/lib/email-html";
import {
  renderNotificationHtmlTemplate,
  renderNotificationSubjectTemplate,
  renderNotificationTextTemplate,
} from "@/lib/notification-template";
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

function listItemsHtml(items: Array<{ name: string }>): TrustedEmailHtml {
  return buildEmailHtmlList(items.map((item) => item.name));
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

export function buildTodayMenuProviderSections(
  providers: Array<Pick<ProviderMenuBundle, "name" | "menuItems">>,
): {
  providerName: string;
  mainsHtml: TrustedEmailHtml;
  sidesHtml: TrustedEmailHtml;
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
  const mainsHtml = joinEmailHtml(
    providers.map((provider) => {
      const mains = itemsByType(provider.menuItems, "main");
      return emailHtml`<p><strong>${provider.name}</strong></p>${listItemsHtml(mains)}`;
    }),
  );
  const sidesHtml = joinEmailHtml(
    providers.map((provider) => {
      const sides = [
        ...itemsByType(provider.menuItems, "side"),
        ...itemsByType(provider.menuItems, "standalone"),
      ];
      return emailHtml`<p><strong>${provider.name}</strong></p>${listItemsHtml(sides)}`;
    }),
  );

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

  const sections = buildTodayMenuProviderSections(providers);
  const orderUrl = `${input.appOrigin.replace(/\/$/, "")}/lunch`;

  return renderTodayMenuEmail(
    {
      firstName: input.firstName,
      menuDate: formatMenuDateLabel(input.orderDate),
      orderingDeadline: formatOrderingDeadline(String(orderDeadline)),
      orderUrl,
      sections,
    },
    input,
  );
}

export function renderTodayMenuEmail(
  context: {
    firstName: string;
    menuDate: string;
    orderingDeadline: string;
    orderUrl: string;
    sections: ReturnType<typeof buildTodayMenuProviderSections>;
  },
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): TodayMenuRenderedEmail {
  const textVariables = {
    first_name: context.firstName,
    menu_date: context.menuDate,
    provider_name: context.sections.providerName,
    mains: context.sections.mainsText,
    sides: context.sections.sidesText,
    ordering_deadline: context.orderingDeadline,
    order_url: context.orderUrl,
  };

  const htmlVariables = {
    ...textVariables,
    mains: context.sections.mainsHtml,
    sides: context.sections.sidesHtml,
  };

  return {
    subject: renderNotificationSubjectTemplate(templates.subjectTemplate, textVariables),
    htmlBody: renderNotificationHtmlTemplate(templates.bodyHtmlTemplate, htmlVariables),
    textBody: renderNotificationTextTemplate(templates.bodyTextTemplate, textVariables),
  };
}

export function firstNameFromFullName(fullName: string | null, email: string): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    return trimmed.split(/\s+/)[0] ?? trimmed;
  }

  return email.split("@")[0] ?? "there";
}
