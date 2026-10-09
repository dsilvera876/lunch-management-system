import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EMPTY_HR_CANCEL_MODAL_DRAFT,
  hrCancelModalDraftForOrder,
  hrCancelModalDraftOnSessionEnd,
  hrCancelSubmitCompletion,
  shouldStartHrCancelSubmit,
  type HrCancelModalDraftFields,
} from "@/lib/hr-todays-order-cancel-modal-session";

const ORDER_A = "00000000-0000-4000-8000-00000000000a";
const ORDER_B = "00000000-0000-4000-8000-00000000000b";

function dirtyDraft(
  overrides: Partial<HrCancelModalDraftFields> = {},
): HrCancelModalDraftFields {
  return {
    reason: "Employee asked to cancel",
    error: "Enter a reason for this HR cancellation.",
    submitting: false,
    ...overrides,
  };
}

describe("hr todays order cancel modal session", () => {
  it("clears a typed reason when the modal closes and reopens", () => {
    const closed = hrCancelModalDraftOnSessionEnd();
    assert.notEqual(dirtyDraft().reason, "");
    assert.equal(closed.reason, "");
  });

  it("clears a validation error when the modal closes and reopens", () => {
    const closed = hrCancelModalDraftOnSessionEnd();
    assert.ok(dirtyDraft().error);
    assert.equal(closed.error, null);
    assert.equal(closed.submitting, false);
  });

  it("resets draft after a successful cancellation", () => {
    const afterSuccess = hrCancelModalDraftOnSessionEnd();
    assert.deepEqual(afterSuccess, {
      reason: "",
      error: null,
      submitting: false,
    });
  });

  it("does not carry a reason from one order card to another", () => {
    const leaked = dirtyDraft({ error: null });
    const switched = hrCancelModalDraftForOrder(ORDER_A, ORDER_B, leaked);
    assert.deepEqual(switched, EMPTY_HR_CANCEL_MODAL_DRAFT);

    const sameOrder = hrCancelModalDraftForOrder(ORDER_A, ORDER_A, leaked);
    assert.equal(sameOrder.reason, leaked.reason);
  });

  it("still notifies after a successful cancel if the dialog already closed", () => {
    assert.equal(
      hrCancelSubmitCompletion({ sessionMatches: false, ok: true }),
      "notify-only",
    );
    assert.equal(
      hrCancelSubmitCompletion({ sessionMatches: true, ok: true }),
      "dismiss-and-notify",
    );
    assert.equal(
      hrCancelSubmitCompletion({ sessionMatches: false, ok: false }),
      "ignore",
    );
    assert.equal(
      hrCancelSubmitCompletion({ sessionMatches: true, ok: false }),
      "apply-error",
    );
  });

  it("rejects a second cancel submit while the first request is pending", () => {
    assert.equal(shouldStartHrCancelSubmit(false), true);
    assert.equal(shouldStartHrCancelSubmit(true), false);
  });

  it("wires close, success, and the pending cancel button through the session helpers", () => {
    const source = readFileSync(
      "src/components/admin/todays-orders/hr-todays-order-cancel-modal.tsx",
      "utf8",
    );

    assert.match(source, /hrCancelModalDraftOnSessionEnd/);
    assert.match(source, /hrCancelModalDraftForOrder/);
    assert.match(source, /shouldStartHrCancelSubmit/);
    assert.match(source, /handleOpenChange/);
    assert.match(source, /disabled=\{submitting\}/);
    assert.match(source, /aria-busy=\{submitting/);
    assert.match(source, /Cancelling…/);
    assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  });
});
