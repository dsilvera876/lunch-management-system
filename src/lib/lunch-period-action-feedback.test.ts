import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LUNCH_PERIOD_CREATED_SUCCESS,
  LUNCH_PERIOD_CURRENT_SUCCESS,
  LUNCH_PERIOD_SUCCESS_TOAST_DURATION_MS,
  LUNCH_PERIOD_UPDATED_SUCCESS,
  lunchPeriodActionErrorMessage,
} from "./lunch-period-action-feedback";

describe("lunch period action feedback", () => {
  it("defines temporary success toast copy for create, update, and make-current actions", () => {
    assert.equal(LUNCH_PERIOD_CREATED_SUCCESS, "Lunch period created successfully.");
    assert.equal(LUNCH_PERIOD_UPDATED_SUCCESS, "Lunch period updated successfully.");
    assert.equal(
      LUNCH_PERIOD_CURRENT_SUCCESS,
      "Current lunch period updated successfully.",
    );
    assert.equal(LUNCH_PERIOD_SUCCESS_TOAST_DURATION_MS, 4_500);
  });

  it("preserves the detailed range validation error and generic mutation failure", () => {
    assert.match(lunchPeriodActionErrorMessage("invalid-range"), /contiguous/);
    assert.equal(
      lunchPeriodActionErrorMessage("update"),
      "Unable to complete that lunch period action.",
    );
    assert.equal(
      lunchPeriodActionErrorMessage("unexpected"),
      "Unable to complete that lunch period action.",
    );
  });

  it("returns structured action results without success redirects or page-level banners", () => {
    const actions = readFileSync(
      new URL("../app/admin/lunch-periods/actions.ts", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/admin/lunch-periods/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL(
        "../components/admin/lunch-periods/lunch-periods-workspace.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    assert.doesNotMatch(actions, /redirect\(/);
    assert.match(actions, /revalidatePath\("\/admin\/lunch-periods"\)/);
    assert.match(actions, /return \{ success: true \}/);
    assert.doesNotMatch(page, /created\?|updated\?|current\?|variant="success"/);
    assert.match(page, /LunchPeriodsWorkspace/);
    assert.match(workspace, /ToastProvider/);
    assert.match(workspace, /FormActionStatus variant="error"/);
    assert.match(workspace, /submittingRef\.current/);
    assert.match(workspace, /aria-busy=/);
    assert.match(workspace, /focus\(\{ preventScroll: true \}\)/);
  });
});
