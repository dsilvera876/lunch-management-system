import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { emptyProviderDraft, replaceMain, addSide } from "./lunch-order-draft";
import {
  buildCheckoutSuccessToastBody,
  buildOrderPlacedToastBody,
  clearSubmittedProviderDraft,
} from "./lunch-order-submit-ui";

describe("lunch order submit workflow", () => {
  it("submitProviderOrder returns success instead of redirecting to order detail", () => {
    const actionsSource = readFileSync(
      new URL("../app/lunch/actions.ts", import.meta.url),
      "utf8",
    );
    const submitBlock =
      actionsSource.split("export async function submitProviderOrder")[1]?.split(
        "export async function updateLunchOrder",
      )[0] ?? "";

    assert.match(submitBlock, /Promise<SubmitProviderOrderResult>/);
    assert.match(submitBlock, /return \{ ok: true, orderId, providerId \}/);
    assert.doesNotMatch(submitBlock, /redirect\(`\/lunch\/orders/);
  });

  it("clears only the submitted provider draft", () => {
    const draftsBefore = {
      "provider-a": replaceMain(addSide(emptyProviderDraft(), "side-1"), "main-1"),
      "provider-b": replaceMain(emptyProviderDraft(), "main-2"),
    };

    const drafts = clearSubmittedProviderDraft(draftsBefore, "provider-a");

    assert.deepEqual(drafts["provider-a"], emptyProviderDraft());
    assert.equal(drafts["provider-b"].mainId, "main-2");
  });

  it("builds success toast copy with provider and delivery date", () => {
    const body = buildOrderPlacedToastBody(
      "Fresh Fruit Vendor",
      "2026-09-21",
    );
    assert.match(body, /Fresh Fruit Vendor/);
    assert.match(body, /September/);
  });

  it("workspace submits cart checkout and clears cart on success", () => {
    const workspaceSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspaceSource, /submitLunchCheckout/);
    assert.match(workspaceSource, /setCart\(\[\]\)/);
    assert.match(workspaceSource, /cartEntries: cart/);
    assert.match(workspaceSource, /findUnfinishedWorkingDrafts/);
    assert.match(workspaceSource, /onCheckoutSuccess/);
    assert.match(workspaceSource, /if \(result\.ok\)/);
    assert.match(workspaceSource, /setValidationError/);
  });

  it("builds checkout success toast with order and provider counts", () => {
    const body = buildCheckoutSuccessToastBody(3, 2, "2026-09-21");
    assert.match(body, /3 lunch orders from 2 providers/);
    assert.match(body, /September/);
  });

  it("shows one checkout success toast from shell", () => {
    const shellSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-shell.tsx", import.meta.url),
      "utf8",
    );

    assert.match(shellSource, /Lunch order placed successfully/);
    assert.match(shellSource, /buildCheckoutSuccessToastBody/);
    assert.match(shellSource, /View My Orders/);
  });

  it("Today's Order page no longer lists current delivery orders", () => {
    const lunchPageSource = readFileSync(
      new URL("../app/lunch/page.tsx", import.meta.url),
      "utf8",
    );
    const myOrdersSource = readFileSync(
      new URL("../app/my-orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(lunchPageSource, /Your orders for this delivery/);
    assert.doesNotMatch(lunchPageSource, /OrderSummaryCard/);
    assert.doesNotMatch(lunchPageSource, /Legacy open lunches/);
    assert.doesNotMatch(lunchPageSource, /provider_id.*null/);
    assert.match(myOrdersSource, /grouped by checkout/);
    assert.match(myOrdersSource, /staff-my-orders-load/);
  });
});
