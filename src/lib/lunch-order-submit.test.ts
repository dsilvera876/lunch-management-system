import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { emptyProviderDraft, replaceMain, addSide } from "./lunch-order-draft";
import {
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
        "export async function submitLunchOrder",
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

  it("workspace submits via client handler and resets draft on confirmed success", () => {
    const workspaceSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspaceSource, /await submitProviderOrder/);
    assert.match(workspaceSource, /clearSubmittedProviderDraft/);
    assert.match(workspaceSource, /onOrderPlacedSuccess/);
    assert.doesNotMatch(workspaceSource, /action=\{submitProviderOrder\}/);
    assert.match(workspaceSource, /if \(result\.ok\)/);
    assert.match(workspaceSource, /setValidationError/);
  });

  it("shows toast only from shell after success callback", () => {
    const shellSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-shell.tsx", import.meta.url),
      "utf8",
    );
    const toastSource = readFileSync(
      new URL("../components/ui/toast.tsx", import.meta.url),
      "utf8",
    );

    assert.match(shellSource, /showToast/);
    assert.match(shellSource, /Order placed successfully/);
    assert.match(shellSource, /View My Orders/);
    assert.match(toastSource, /aria-live="polite"/);
    assert.match(toastSource, /bottom-4/);
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
    assert.match(myOrdersSource, /my-orders|My Orders/i);
  });
});
