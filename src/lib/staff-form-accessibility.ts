/** Staff form accessibility helpers (Phase B). */

export function joinDescribedBy(
  ...ids: Array<string | undefined | null | false>
): string | undefined {
  const parts = ids.filter((id): id is string => Boolean(id));
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function focusFormErrorSummary(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  window.requestAnimationFrame(() => {
    element.focus();
  });
}

export type ProviderOrderFieldKey =
  | "main"
  | "sides"
  | "mealQuantity"
  | "specialInstructions"
  | "officeLocation";

/** Maps client validation copy to a field group for aria-invalid and summary links. */
export function classifyProviderOrderValidationError(
  message: string,
): ProviderOrderFieldKey | "general" {
  const normalized = message.toLowerCase();

  if (normalized.includes("delivery location")) {
    return "officeLocation";
  }
  if (normalized.includes("special instructions")) {
    return "specialInstructions";
  }
  if (normalized.includes("meal quantity")) {
    return "mealQuantity";
  }
  if (normalized.includes("main item requires") || normalized.includes("at least one side")) {
    return "sides";
  }
  if (normalized.includes("side items require a main") || normalized.includes("select a main")) {
    return "main";
  }
  if (normalized.includes("main") && normalized.includes("side")) {
    return "general";
  }

  return "general";
}

/** Stable element id for the meal quantity input in ProviderOrderForm. */
export const PROVIDER_ORDER_MEAL_QUANTITY_INPUT_ID = "mealQuantity";
export const PROVIDER_ORDER_OFFICE_LOCATION_SELECT_ID = "officeLocationSelect";
export const PROVIDER_ORDER_SPECIAL_INSTRUCTIONS_ID = "specialInstructions";

export function resolveProviderOrderErrorFocusTargetId(
  field: ProviderOrderFieldKey,
  groupIds: { mainGroupId: string; sideGroupId: string },
): string {
  switch (field) {
    case "main":
      return groupIds.mainGroupId;
    case "sides":
      return groupIds.sideGroupId;
    case "mealQuantity":
      return PROVIDER_ORDER_MEAL_QUANTITY_INPUT_ID;
    case "officeLocation":
      return PROVIDER_ORDER_OFFICE_LOCATION_SELECT_ID;
    case "specialInstructions":
      return PROVIDER_ORDER_SPECIAL_INSTRUCTIONS_ID;
  }
}

export function focusProviderOrderValidationTarget(targetId: string): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }

    if (
      element instanceof HTMLFieldSetElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      element.focus();
      return;
    }

    const focusable = element.querySelector<HTMLElement>(
      "input:not([type='hidden']), select, textarea, button",
    );
    focusable?.focus();
  });
}

export const STAFF_FORM_ERROR_FOCUS_STRATEGY = {
  providerOrderForm:
    "On failed submit, focus the error summary (role=alert) first; field groups expose aria-invalid and inline errors.",
  lateOrderRequest:
    "On failed submit, focus the error summary first; invalid fields use aria-invalid and aria-describedby.",
  lunchCheckout:
    "On failed submit, focus the error summary except when delivery location is missing — then open the location picker without stealing focus from that flow.",
} as const;
