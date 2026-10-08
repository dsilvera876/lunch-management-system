import { test, expect, type Page } from "@playwright/test";
import {
  applyLateOrderSubmissionEditFixture,
  restoreLateOrderSubmissionEditFixture,
  E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES,
} from "./helpers/e2e-ordering-fixture";

function editButtonForSummary(page: Page, summary: string) {
  return page
    .locator(".rounded-xl.border")
    .filter({ hasText: summary })
    .getByRole("button", { name: "Edit" });
}

test.describe("My Orders — late order submission edit focus", () => {
  test.beforeAll(() => {
    applyLateOrderSubmissionEditFixture();
  });

  test.afterAll(() => {
    restoreLateOrderSubmissionEditFixture();
  });

  test("Escape, Cancel, and Save return focus to the opening Edit control", async ({ page }) => {
    await page.goto("/my-orders?tab=late-order-submissions");

    const editB = editButtonForSummary(page, E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.B);
    const editA = editButtonForSummary(page, E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.A);
    await expect(editA).toBeVisible();
    await expect(editB).toBeVisible();

    await editB.focus();
    await editB.click();
    const dialog = page.locator("[data-staff-modal-dialog]");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit late order submission" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(editB).toBeFocused();

    await editB.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(editB).toBeFocused();

    await editA.focus();
    await editA.click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("What I'd like").fill(`${E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.A} saved`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(editA).toBeFocused();
    await expect(page.getByText("Late order submission updated.")).toBeVisible();
  });
});
