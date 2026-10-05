import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  classifyProviderOrderValidationError,
  joinDescribedBy,
  PROVIDER_ORDER_MEAL_QUANTITY_INPUT_ID,
  PROVIDER_ORDER_OFFICE_LOCATION_SELECT_ID,
  PROVIDER_ORDER_SPECIAL_INSTRUCTIONS_ID,
  resolveProviderOrderErrorFocusTargetId,
  STAFF_FORM_ERROR_FOCUS_STRATEGY,
} from "./staff-form-accessibility";

describe("staff form accessibility helpers", () => {
  it("joins describedby ids", () => {
    assert.equal(joinDescribedBy("a", undefined, "b"), "a b");
    assert.equal(joinDescribedBy(), undefined);
  });

  it("classifies provider order validation messages", () => {
    assert.equal(
      classifyProviderOrderValidationError(
        "Choose a delivery location before placing your order.",
      ),
      "officeLocation",
    );
    assert.equal(
      classifyProviderOrderValidationError("A main item requires at least one side item."),
      "sides",
    );
    assert.equal(
      classifyProviderOrderValidationError("Meal quantity must be 1 or more."),
      "mealQuantity",
    );
  });

  it("resolves provider order error-summary focus targets to stable ids", () => {
    const groups = { mainGroupId: "main-group", sideGroupId: "side-group" };
    assert.equal(resolveProviderOrderErrorFocusTargetId("main", groups), "main-group");
    assert.equal(resolveProviderOrderErrorFocusTargetId("sides", groups), "side-group");
    assert.equal(
      resolveProviderOrderErrorFocusTargetId("mealQuantity", groups),
      PROVIDER_ORDER_MEAL_QUANTITY_INPUT_ID,
    );
    assert.equal(
      resolveProviderOrderErrorFocusTargetId("officeLocation", groups),
      PROVIDER_ORDER_OFFICE_LOCATION_SELECT_ID,
    );
    assert.equal(
      resolveProviderOrderErrorFocusTargetId("specialInstructions", groups),
      PROVIDER_ORDER_SPECIAL_INSTRUCTIONS_ID,
    );
  });
});

describe("Phase B staff form wiring", () => {
  it("ProviderOrderForm uses fieldsets for meal option groups", () => {
    const form = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );
    assert.match(form, /<fieldset/);
    assert.match(form, /<legend/);
    assert.match(form, /aria-invalid/);
    assert.match(form, /errorSummaryRef/);
  });

  it("ProviderMenuPanel groups mains and sides with fieldset/legend", () => {
    const panel = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /<fieldset/);
    assert.match(panel, /<legend/);
  });

  it("late order request form wires invalid fields and error summary", () => {
    const panel = readFileSync(
      new URL("../components/dashboard/staff-late-order-request-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /aria-invalid/);
    assert.match(panel, /aria-describedby/);
    assert.match(panel, /errorSummaryRef/);
    assert.match(panel, /htmlFor=/);
    assert.match(panel, /required/);
    assert.match(panel, /aria-hidden="true"/);
    assert.match(panel, /title="Required field"/);
  });

  it("account email preferences avoid incorrect switch role on checkbox", () => {
    const card = readFileSync(
      new URL("../components/account/staff-email-preferences-card.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(card, /role="switch"/);
    assert.match(card, /FormActionStatus|role="status"/);
  });

  it("toast provider uses a single live announcement layer on each toast item", () => {
    const toast = readFileSync(
      new URL("../components/ui/toast.tsx", import.meta.url),
      "utf8",
    );
    const providerSection = toast.slice(0, toast.indexOf("function ToastItem"));
    assert.doesNotMatch(providerSection, /aria-live/);
    assert.match(providerSection, /aria-label="Notifications"/);
    assert.doesNotMatch(
      toast.slice(toast.indexOf("function ToastItem")),
      /aria-live/,
    );
    assert.match(toast, /role=\{variant === "error" \? "alert" : "status"\}/);
  });

  it("past order date picker exposes a keyboard path via labeled trigger", () => {
    const picker = readFileSync(
      new URL("../components/my-orders/past-order-date-picker.tsx", import.meta.url),
      "utf8",
    );
    assert.match(picker, /past-order-date-label/);
    assert.match(picker, /past-order-date-value/);
    assert.match(picker, /aria-labelledby/);
    assert.match(picker, /type="button"/);
    assert.match(picker, /showPicker\(\) only/);
    assert.match(picker, /tabIndex=\{-1\}/);
    assert.match(picker, /aria-hidden="true"/);
  });

  it("provider order error summary links use shared focus target ids", () => {
    const form = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );
    assert.match(form, /resolveProviderOrderErrorFocusTargetId/);
    assert.match(form, /focusProviderOrderValidationTarget/);
    assert.match(form, /tabIndex=\{-1\}/);
    assert.match(form, /id="mealQuantity"/);
  });

  it("documents error focus strategy for staff checkout", () => {
    assert.match(
      STAFF_FORM_ERROR_FOCUS_STRATEGY.lunchCheckout,
      /delivery location/i,
    );
    const workspace = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.match(workspace, /validationErrorRef/);
    assert.match(workspace, /skipErrorSummaryFocus/);
  });

  it("FormSubmitButton exposes busy state while pending", () => {
    const submit = readFileSync(
      new URL("../components/form-submit-button.tsx", import.meta.url),
      "utf8",
    );
    assert.match(submit, /aria-busy/);
  });

  it("SpecialInstructionsField supports invalid and describedby", () => {
    const field = readFileSync(
      new URL("../components/lunch/special-instructions-field.tsx", import.meta.url),
      "utf8",
    );
    assert.match(field, /aria-invalid/);
    assert.match(field, /helperId/);
  });
});
