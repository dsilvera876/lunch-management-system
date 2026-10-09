import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  HR_EDIT_REASON_LABEL,
  HR_EDIT_REASON_REQUIRED_MESSAGE,
  HR_TODAYS_ORDER_EDIT_DIALOG_CLASS,
  HR_TODAYS_ORDER_EDIT_PANEL_CLASS,
  HR_TODAYS_ORDER_EDIT_SCROLL_CLASS,
} from "@/lib/hr-todays-order-edit-modal-presentation";

describe("hr todays order edit modal presentation", () => {
  it("defines reason copy and viewport-bounded scroll shell classes", () => {
    assert.equal(HR_EDIT_REASON_LABEL, "Reason for change");
    assert.match(HR_EDIT_REASON_REQUIRED_MESSAGE, /reason/i);
    assert.match(HR_TODAYS_ORDER_EDIT_DIALOG_CLASS, /overflow-hidden/);
    assert.match(HR_TODAYS_ORDER_EDIT_PANEL_CLASS, /90dvh/);
    assert.match(HR_TODAYS_ORDER_EDIT_SCROLL_CLASS, /overscroll-contain/);
  });

  it("places the reason field above Save via submitFooter", () => {
    const editModal = readFileSync(
      "src/components/admin/todays-orders/hr-todays-order-edit-modal.tsx",
      "utf8",
    );
    const form = readFileSync("src/components/provider-order-form.tsx", "utf8");

    assert.match(editModal, /submitFooter=\{reasonField\}/);
    assert.match(editModal, /HrTodaysOrderEditReasonField/);
    assert.match(editModal, /HR_EDIT_REASON_REQUIRED_MESSAGE/);
    assert.match(editModal, /showClientSubmitError/);
    assert.match(editModal, /clientSubmitGuard=\{reportReasonRequired\}/);
    assert.match(editModal, /reportValidity\(\)/);
    assert.match(form, /submitFooter \? <div className="mb-4">\{submitFooter\}<\/div> : null/);
    assert.match(editModal, /showClientSubmitError/);
  });

  it("locks document scroll while staff modals are open", () => {
    const popover = readFileSync("src/components/ui/focus-trap-popover.tsx", "utf8");
    assert.match(popover, /staffModalScrollLock\.acquire\(\)/);
    assert.match(popover, /staffModalScrollLock\.release\(\)/);
  });
});
