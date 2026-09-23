import { formatLateOrderTimeLabel } from "@/lib/late-orders";

export const LATE_ORDER_MANAGE_PROVIDERS_HREF = "/admin/providers";

export type LateOrdersUnavailableReason = "no_providers" | "no_window";

export function hasActionableLateOrderCreationCycle(
  lateOrderProviderIds: string[],
  providerCreationCycles: Record<string, unknown[]>,
): boolean {
  return lateOrderProviderIds.some(
    (providerId) => (providerCreationCycles[providerId] ?? []).length > 0,
  );
}

/** When set, render a single page empty state instead of numbered workflow sections. */
export function resolveLateOrdersUnavailableReason(input: {
  lateOrderProviderCount: number;
  hasActionableCreationCycle: boolean;
  statusSummaryCount: number;
}): LateOrdersUnavailableReason | null {
  if (input.statusSummaryCount > 0) {
    return null;
  }

  if (input.lateOrderProviderCount === 0) {
    return "no_providers";
  }

  if (!input.hasActionableCreationCycle) {
    return "no_window";
  }

  return null;
}

export function shouldShowLateOrderFullWorkflow(
  hasActionableCreationCycle: boolean,
): boolean {
  return hasActionableCreationCycle;
}

export function shouldShowLateOrderProviderStatusSection(input: {
  unavailableReason: LateOrdersUnavailableReason | null;
  hasActionableCreationCycle: boolean;
  statusSummaryCount: number;
}): boolean {
  if (input.unavailableReason !== null) {
    return false;
  }

  return input.hasActionableCreationCycle || input.statusSummaryCount > 0;
}

export function formatSupplementEmailModeLabel(
  dispatchMode: string,
): "Manual" | "Automatic" {
  return dispatchMode === "automatic" ? "Automatic" : "Manual";
}

/** Compact cutoff label for provider status cards (time only when configured). */
export function formatProviderLateOrderCutoffLabel(
  deadlineTime: string | null | undefined,
): string {
  if (!deadlineTime) {
    return "Not configured";
  }

  return formatLateOrderTimeLabel(deadlineTime);
}

/** Waiting-order line for HR provider status; null when count is zero. */
export function formatWaitingApprovedOrdersLine(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  return `${count} approved order${count === 1 ? "" : "s"} waiting to send`;
}

export type LateOrderProviderStatusDisplay = {
  providerName: string;
  deliveryDateLabel: string;
  lateOrderingOpen: boolean;
  cutoffLabel: string;
  supplementEmailMode: "Manual" | "Automatic";
  automaticScheduleLabel: string | null;
  waitingApprovedLine: string | null;
  closedReason: string | null;
  snapshotWarningMessage: string | null;
  supplementStatusDetail: string | null;
};

export function buildLateOrderProviderStatusDisplay(input: {
  providerName: string;
  deliveryDateLabel: string;
  lateOrderingOpen: boolean;
  acceptsLateOrders: boolean;
  cutoffLabel: string;
  dispatchMode: string;
  automaticScheduleLabel: string | null;
  approvedUnsentCount: number;
  supplementStatusLabel: string;
  snapshotWarningMessage: string | null;
  deadlineSummary: string;
}): LateOrderProviderStatusDisplay {
  const supplementEmailMode = formatSupplementEmailModeLabel(input.dispatchMode);

  let supplementStatusDetail: string | null = null;
  const redundantManual =
    supplementEmailMode === "Manual" &&
    (input.supplementStatusLabel === "Manual supplemental sending" ||
      input.supplementStatusLabel === "No late orders to send");

  if (!redundantManual && input.supplementStatusLabel.trim().length > 0) {
    supplementStatusDetail = input.supplementStatusLabel;
  }

  let closedReason: string | null = null;
  if (!input.lateOrderingOpen) {
    if (!input.acceptsLateOrders) {
      closedReason = "This provider does not accept late orders.";
    } else if (input.snapshotWarningMessage) {
      closedReason = input.snapshotWarningMessage;
    } else {
      closedReason = input.deadlineSummary;
    }
  }

  return {
    providerName: input.providerName,
    deliveryDateLabel: input.deliveryDateLabel,
    lateOrderingOpen: input.lateOrderingOpen,
    cutoffLabel: input.cutoffLabel,
    supplementEmailMode,
    automaticScheduleLabel:
      supplementEmailMode === "Automatic" ? input.automaticScheduleLabel : null,
    waitingApprovedLine: formatWaitingApprovedOrdersLine(input.approvedUnsentCount),
    closedReason,
    snapshotWarningMessage: input.lateOrderingOpen ? input.snapshotWarningMessage : null,
    supplementStatusDetail,
  };
}

export const LATE_ORDER_MENU_LOADING_LABEL = "Loading menu…";

export const LATE_ORDER_CYCLE_DATE_LOADING_LABEL = "Loading…";

export const LATE_ORDER_PROVIDER_MENU_LOADING_ANNOUNCEMENT = "Loading provider menu.";

export const LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE = "Late order created successfully.";

export const LATE_ORDER_CREATE_SUCCESS_TOAST_DURATION_MS = 5000;

export function formatLateOrderCreateErrorMessage(errorReason: string): string {
  const detail = errorReason.trim();
  const actionLabel = "Unable to create late order";

  if (!detail) {
    return actionLabel;
  }

  return `${actionLabel}. ${detail}`;
}
