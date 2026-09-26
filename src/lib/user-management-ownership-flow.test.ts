import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  buildOwnershipTransferConfirmMessage,
  isTransferOwnershipButtonDisabled,
  runOwnershipTransferWithConfirmation,
  shouldInvokeOwnershipTransfer,
} from "./user-management-ownership-flow";
import { TransferOwnershipSubmitButton } from "../components/admin/system-ownership-card";

describe("ownership transfer flow helpers", () => {
  it("disables the button until an employee is selected", () => {
    assert.equal(isTransferOwnershipButtonDisabled("", false), true);
    assert.equal(isTransferOwnershipButtonDisabled("user-id", false), false);
    assert.equal(isTransferOwnershipButtonDisabled("user-id", true), true);
  });

  it("requires confirmation before invoking transfer", () => {
    assert.equal(shouldInvokeOwnershipTransfer(false), false);
    assert.equal(shouldInvokeOwnershipTransfer(true), true);
  });

  it("does not call transfer when confirmation is declined", async () => {
    let called = false;

    const result = await runOwnershipTransferWithConfirmation({
      newOwnerId: "user-1",
      confirm: () => false,
      transfer: async () => {
        called = true;
      },
    });

    assert.equal(result, "cancelled");
    assert.equal(called, false);
  });

  it("calls transfer only after confirmation is accepted", async () => {
    let transferredId: string | null = null;

    const result = await runOwnershipTransferWithConfirmation({
      newOwnerId: "user-2",
      confirm: () => true,
      transfer: async (id) => {
        transferredId = id;
      },
    });

    assert.equal(result, "transferred");
    assert.equal(transferredId, "user-2");
  });

  it("builds a confirm message naming both owners", () => {
    const message = buildOwnershipTransferConfirmMessage({
      newOwnerName: "Alex Carter",
      currentOwnerName: "Dev Owner",
    });

    assert.match(message, /Alex Carter/);
    assert.match(message, /Dev Owner will become Admin/);
    assert.match(message, /privileged ownership change/);
  });
});

describe("ownership transfer button render", () => {
  it("always renders Transfer ownership in markup when disabled", () => {
    const html = renderToStaticMarkup(
      createElement(TransferOwnershipSubmitButton, {
        newOwnerId: "",
        isPending: false,
        onClick: () => {},
      }),
    );

    assert.match(html, /Transfer ownership/);
    assert.match(html, /data-testid="transfer-ownership-button"/);
    assert.match(html, /disabled/);
  });

  it("renders enabled button when a new owner is selected", () => {
    const html = renderToStaticMarkup(
      createElement(TransferOwnershipSubmitButton, {
        newOwnerId: "abc-123",
        isPending: false,
        onClick: () => {},
      }),
    );

    assert.match(html, /Transfer ownership/);
    assert.doesNotMatch(html, /disabled=""/);
  });
});

describe("ownership transfer wiring", () => {
  it("confirms before calling transferOwnershipInline", () => {
    const ownership = readFileSync(
      new URL("../components/admin/system-ownership-card.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/user-management-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(ownership, /window\.confirm/);
    assert.match(ownership, /transferOwnershipInline/);
    assert.match(ownership, /TransferOwnershipSubmitButton/);
    assert.match(ownership, /onValueChange=\{\(employeeId\)/);
    assert.match(workspace, /canTransferOwnership \?/);
    assert.match(workspace, /SystemOwnershipCard/);
  });
});
