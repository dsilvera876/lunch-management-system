import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildLateOrderProviderStatusDisplay,
  formatLateOrderCreateErrorMessage,
  formatSupplementEmailModeLabel,
  formatWaitingApprovedOrdersLine,
  hasActionableLateOrderCreationCycle,
  LATE_ORDER_CREATE_SUCCESS_TOAST_DURATION_MS,
  LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE,
  LATE_ORDER_EMPLOYEE_REQUIRED_MESSAGE,
  LATE_ORDER_MENU_EMPTY_MESSAGE,
  LATE_ORDER_MENU_LOAD_ERROR_MESSAGE,
  LATE_ORDER_MENU_LOADING_LABEL,
  LATE_ORDER_PROVIDER_MENU_LOADING_ANNOUNCEMENT,
  LATE_ORDER_MANAGE_PROVIDERS_HREF,
  lateOrderMenuUnavailableMessage,
  resolveLateOrderMenuPresentation,
  resolveLateOrdersUnavailableReason,
  shouldShowLateOrderFullWorkflow,
  shouldShowLateOrderProviderStatusSection,
} from "./late-orders-presentation";

describe("late orders presentation", () => {
  it("maps supplemental dispatch mode labels", () => {
    assert.equal(formatSupplementEmailModeLabel("manual"), "Manual");
    assert.equal(formatSupplementEmailModeLabel("automatic"), "Automatic");
  });

  it("hides waiting approved count when zero", () => {
    assert.equal(formatWaitingApprovedOrdersLine(0), null);
  });

  it("shows waiting approved count when greater than zero", () => {
    assert.equal(formatWaitingApprovedOrdersLine(1), "1 approved order waiting to send");
    assert.equal(formatWaitingApprovedOrdersLine(2), "2 approved orders waiting to send");
  });

  it("avoids duplicate manual supplemental status lines", () => {
    const display = buildLateOrderProviderStatusDisplay({
      providerName: "Alberries Caterors",
      deliveryDateLabel: "Sep 23, 2026",
      lateOrderingOpen: true,
      acceptsLateOrders: true,
      cutoffLabel: "10:30 AM",
      dispatchMode: "manual",
      automaticScheduleLabel: null,
      approvedUnsentCount: 0,
      supplementStatusLabel: "Manual supplemental sending",
      snapshotWarningMessage: null,
      deadlineSummary: "Late orders accepted until 10:30 AM on delivery day",
    });

    assert.equal(display.supplementEmailMode, "Manual");
    assert.equal(display.waitingApprovedLine, null);
    assert.equal(display.supplementStatusDetail, null);
  });

  it("shows actionable supplement detail when not redundant", () => {
    const display = buildLateOrderProviderStatusDisplay({
      providerName: "Alberries Caterors",
      deliveryDateLabel: "Sep 23, 2026",
      lateOrderingOpen: false,
      acceptsLateOrders: true,
      cutoffLabel: "10:30 AM",
      dispatchMode: "automatic",
      automaticScheduleLabel: "Sends daily at 9:00 AM on delivery day",
      approvedUnsentCount: 2,
      supplementStatusLabel: "Automatic send failed — manual retry available",
      snapshotWarningMessage: null,
      deadlineSummary: "Late orders accepted until 10:30 AM on delivery day",
    });

    assert.equal(display.waitingApprovedLine, "2 approved orders waiting to send");
    assert.match(display.supplementStatusDetail ?? "", /failed/);
  });

  it("detects no configured late-order providers", () => {
    assert.equal(
      resolveLateOrdersUnavailableReason({
        lateOrderProviderCount: 0,
        hasActionableCreationCycle: false,
        statusSummaryCount: 0,
      }),
      "no_providers",
    );
    assert.equal(shouldShowLateOrderFullWorkflow(false), false);
  });

  it("detects configured providers without an actionable window", () => {
    assert.equal(
      resolveLateOrdersUnavailableReason({
        lateOrderProviderCount: 2,
        hasActionableCreationCycle: false,
        statusSummaryCount: 0,
      }),
      "no_window",
    );
  });

  it("shows full workflow when a creation cycle is actionable", () => {
    assert.equal(
      resolveLateOrdersUnavailableReason({
        lateOrderProviderCount: 1,
        hasActionableCreationCycle: true,
        statusSummaryCount: 0,
      }),
      null,
    );
    assert.equal(shouldShowLateOrderFullWorkflow(true), true);
    assert.equal(
      shouldShowLateOrderProviderStatusSection({
        unavailableReason: null,
        hasActionableCreationCycle: true,
        statusSummaryCount: 0,
      }),
      true,
    );
  });

  it("shows provider status without full workflow when summaries exist", () => {
    assert.equal(
      resolveLateOrdersUnavailableReason({
        lateOrderProviderCount: 1,
        hasActionableCreationCycle: false,
        statusSummaryCount: 1,
      }),
      null,
    );
    assert.equal(shouldShowLateOrderFullWorkflow(false), false);
    assert.equal(
      shouldShowLateOrderProviderStatusSection({
        unavailableReason: null,
        hasActionableCreationCycle: false,
        statusSummaryCount: 1,
      }),
      true,
    );
  });

  it("uses user-facing provider menu loading copy", () => {
    assert.equal(LATE_ORDER_MENU_LOADING_LABEL, "Loading menu…");
    assert.equal(LATE_ORDER_PROVIDER_MENU_LOADING_ANNOUNCEMENT, "Loading provider menu.");
  });

  it("formats late-order create error messages for toast feedback", () => {
    assert.equal(
      formatLateOrderCreateErrorMessage(LATE_ORDER_EMPLOYEE_REQUIRED_MESSAGE),
      "Unable to create late order. Select an employee.",
    );
    assert.equal(formatLateOrderCreateErrorMessage(""), "Unable to create late order");
    assert.equal(LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE, "Late order created successfully.");
    assert.equal(LATE_ORDER_CREATE_SUCCESS_TOAST_DURATION_MS, 5000);
  });

  it("links manage providers to the admin providers route", () => {
    assert.equal(LATE_ORDER_MANAGE_PROVIDERS_HREF, "/admin/providers");
    assert.equal(
      hasActionableLateOrderCreationCycle(["p1"], { p1: [{ deliveryDate: "2026-09-23" }] }),
      true,
    );
    assert.equal(hasActionableLateOrderCreationCycle(["p1"], { p1: [] }), false);
  });

  it("wires HR late-order layout and provider status components", () => {
    const workspace = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );
    const form = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /layoutVariant="late-order"/);
    assert.match(workspace, /LateOrderProviderStatusCard/);
    assert.match(workspace, /LateOrdersUnavailableCard/);
    assert.match(workspace, /LateOrderSectionHeader/);
    assert.match(form, /LateOrderSummaryPanel/);
    assert.match(form, /LateOrderMenuLoadingSkeleton/);
    assert.match(form, /menuLoading/);
    assert.match(form, /submitDisabled/);
    assert.match(form, /LateOrderSectionHeader/);
    assert.match(workspace, /3\. Provider Status/);
    assert.doesNotMatch(workspace, /No providers are configured to accept late orders/);
    assert.match(workspace, /loadHrLateOrderSnapshotMenuAction/);
    assert.match(form, /layoutVariant === "late-order"/);
    assert.match(form, /compactMenuLayout/);
    assert.match(form, /lateOrderMajorCardClassName/);
    assert.match(form, /lateOrderMenuOptionClassName/);
    assert.match(form, /md:border-l md:border-border/);
    assert.match(workspace, /lateOrderMajorCardClassName/);
    assert.match(workspace, /ToastProvider/);
    assert.match(workspace, /showToast/);
    assert.match(workspace, /LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE/);
    assert.match(workspace, /formatLateOrderCreateErrorMessage/);
    assert.match(workspace, /variant: "error"/);
    assert.doesNotMatch(
      workspace,
      /setFeedback\(\{[\s\S]*Late order created successfully/,
    );
    assert.doesNotMatch(workspace, /scrollTo/);
    assert.match(workspace, /showWorkflowForm/);
    assert.match(workspace, /menuLoading=\{loadingMenu\}/);
    assert.doesNotMatch(workspace, /Loading frozen menu snapshot/);
    assert.doesNotMatch(workspace, /!creationDisabled/);
    assert.match(workspace, /setMenuItems\(\[\]\)/);
    assert.match(workspace, /menuSelectionEpoch/);
    assert.doesNotMatch(workspace, /key=\{formKey\}/);
    assert.doesNotMatch(workspace, /setFormKey/);
    assert.match(workspace, /min-h-5 text-sm leading-5 text-muted/);
    assert.match(workspace, /LATE_ORDER_CYCLE_DATE_LOADING_LABEL/);
    assert.match(form, /menuSelectionEpoch/);
  });

  it("resolves late-order menu presentation states", () => {
    assert.equal(resolveLateOrderMenuPresentation({
      loading: true,
      loadSucceeded: false,
      rpcStatus: null,
      menuItemCount: 0,
    }).kind, "loading");

    assert.equal(resolveLateOrderMenuPresentation({
      loading: false,
      loadSucceeded: true,
      rpcStatus: "available",
      menuItemCount: 3,
    }).kind, "ready");

    assert.equal(resolveLateOrderMenuPresentation({
      loading: false,
      loadSucceeded: true,
      rpcStatus: "available",
      menuItemCount: 0,
    }).kind, "empty");

    assert.equal(
      lateOrderMenuUnavailableMessage(
        resolveLateOrderMenuPresentation({
          loading: false,
          loadSucceeded: true,
          rpcStatus: "available",
          menuItemCount: 0,
        }),
      ),
      LATE_ORDER_MENU_EMPTY_MESSAGE,
    );

    assert.equal(
      lateOrderMenuUnavailableMessage(
        resolveLateOrderMenuPresentation({
          loading: false,
          loadSucceeded: false,
          rpcStatus: "error",
          menuItemCount: 0,
        }),
      ),
      LATE_ORDER_MENU_LOAD_ERROR_MESSAGE,
    );
  });

  it("keeps HR late-order employee and menu copy free of implementation terms", () => {
    const workspace = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/late-orders/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /useState\(""\)/);
    assert.match(workspace, /setProfileId\(""\)/);
    assert.doesNotMatch(workspace, /employees\[0\]/);
    assert.match(actions, /LATE_ORDER_EMPLOYEE_REQUIRED_MESSAGE/);
    assert.match(workspace, /resolveLateOrderMenuPresentation/);
    assert.match(workspace, /lateOrderMenuUnavailableMessage/);
    assert.doesNotMatch(workspace, /This snapshot has no active menu items/);
    assert.doesNotMatch(workspace, /Menu snapshot/);
    assert.doesNotMatch(workspace, /frozen snapshot/i);
    assert.doesNotMatch(workspace, /active menu items/i);
    assert.equal(LATE_ORDER_MENU_LOADING_LABEL, "Loading menu…");
    assert.equal(
      LATE_ORDER_MENU_EMPTY_MESSAGE,
      "No menu items are available for this provider and delivery date.",
    );
    assert.equal(
      LATE_ORDER_MENU_LOAD_ERROR_MESSAGE,
      "Unable to load the menu for this provider and delivery date.",
    );
  });
});
