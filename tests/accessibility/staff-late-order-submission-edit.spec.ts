import { test, expect, type Page } from "@playwright/test";
import {
  applyLateOrderSubmissionEditFixture,
  applyLateOrderSubmissionPresentationFixture,
  restoreLateOrderSubmissionEditFixture,
  E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES,
  E2E_LATE_ORDER_SUBMISSION_PRESENTATION,
} from "./helpers/e2e-ordering-fixture";
import { expectNoAxeViolations } from "./helpers/axe";
import { expectNoUnintendedHorizontalPageScroll } from "./helpers/layout";

function editButtonForSummary(page: Page, summary: string) {
  return page
    .locator(".rounded-xl.border")
    .filter({ hasText: summary })
    .getByRole("button", { name: "Edit" });
}

test.describe("My Orders — late order submission edit focus", () => {
  test.describe.configure({ mode: "serial" });

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
    await expect(
      page
        .getByTestId("late-order-submission-card")
        .filter({ hasText: E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.B })
        .getByRole("button", { name: /^Cancel late order submission for / }),
    ).toBeVisible();

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

  test("renders fulfilled and declined request cards without a redundant View Order action", async ({
    page,
  }) => {
    applyLateOrderSubmissionPresentationFixture();
    await page.goto("/my-orders?tab=late-order-submissions");

    const fulfilledCard = page
      .getByTestId("late-order-submission-card")
      .filter({ hasText: E2E_LATE_ORDER_SUBMISSION_PRESENTATION.fulfilledSummary });
    const declinedCard = page
      .getByTestId("late-order-submission-card")
      .filter({ hasText: E2E_LATE_ORDER_SUBMISSION_PRESENTATION.declinedSummary });
    const fulfilledProviderName = (
      await fulfilledCard.getByRole("heading", { level: 3 }).textContent()
    )?.trim();
    const declinedProviderName = (
      await declinedCard.getByRole("heading", { level: 3 }).textContent()
    )?.trim();
    expect(fulfilledProviderName).toBeTruthy();
    expect(declinedProviderName).toBeTruthy();
    await expect(fulfilledCard).toHaveAccessibleName(fulfilledProviderName!);
    await expect(declinedCard).toHaveAccessibleName(declinedProviderName!);

    for (const card of [fulfilledCard, declinedCard]) {
      await expect(card.getByText(/^Delivery /)).toBeVisible();
      await expect(card.getByText("Location", { exact: true })).toBeVisible();
      await expect(card.getByText("Submitted", { exact: true })).toBeVisible();
      await expect(card.getByText("Quantity", { exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: "View order" })).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: /^Edit late order submission for / }),
      ).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: /^Cancel late order submission for / }),
      ).toHaveCount(0);
    }

    await expect(fulfilledCard.getByText("Fulfilled", { exact: true })).toBeVisible();
    await expect(fulfilledCard.getByRole("region", { name: "Requested items" })).toContainText(
      E2E_LATE_ORDER_SUBMISSION_PRESENTATION.fulfilledSummary,
    );
    await expect(
      fulfilledCard.getByRole("region", { name: "Special instructions" }),
    ).toContainText(E2E_LATE_ORDER_SUBMISSION_PRESENTATION.fulfilledInstructions);

    await expect(declinedCard.getByText("Declined", { exact: true })).toBeVisible();
    await expect(declinedCard.getByRole("region", { name: "Requested items" })).toContainText(
      E2E_LATE_ORDER_SUBMISSION_PRESENTATION.declinedSummary,
    );
    await expect(declinedCard.getByRole("status", { name: "Decline reason" })).toContainText(
      E2E_LATE_ORDER_SUBMISSION_PRESENTATION.declineReason,
    );
    await expect(
      declinedCard.getByRole("region", { name: "Special instructions" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page, "My Orders late-order submission cards", {
      mainContentOnly: true,
    });

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(fulfilledCard).toBeVisible();
      await expect(declinedCard).toBeVisible();
      await expectNoUnintendedHorizontalPageScroll(page);
      for (const card of [fulfilledCard, declinedCard]) {
        expect(
          await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
      }
    }
  });
});
