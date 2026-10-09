import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createClientSubmitLock,
  releaseClientSubmitLock,
  tryBeginClientSubmit,
} from "@/lib/provider-order-client-submit";

describe("provider order client submit lock", () => {
  it("ignores a second begin while the first client submit is in progress", () => {
    const lock = createClientSubmitLock();
    assert.equal(tryBeginClientSubmit(lock), true);
    assert.equal(tryBeginClientSubmit(lock), false);
    assert.equal(lock.held, true);
  });

  it("releases the lock after a validation or server error", () => {
    const lock = createClientSubmitLock();
    assert.equal(tryBeginClientSubmit(lock), true);
    releaseClientSubmitLock(lock);
    assert.equal(tryBeginClientSubmit(lock), true);
  });

  it("keeps the lock after success so the same mounted form cannot submit again", () => {
    const lock = createClientSubmitLock();
    assert.equal(tryBeginClientSubmit(lock), true);
    assert.equal(tryBeginClientSubmit(lock), false);
  });

  it("wires onClientSubmit pending state without replacing useFormStatus for other forms", () => {
    const form = readFileSync("src/components/provider-order-form.tsx", "utf8");
    const button = readFileSync("src/components/form-submit-button.tsx", "utf8");

    assert.match(form, /tryBeginClientSubmit/);
    assert.match(form, /releaseClientSubmitLock/);
    assert.match(form, /forcePending=\{clientSubmitPending\}/);
    assert.match(button, /useFormStatus/);
    assert.match(button, /forcePending \|\| formPending/);
  });
});
