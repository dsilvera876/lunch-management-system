import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { STAFF_AXE_WCAG_TAGS, formatAxeViolations } from "./helpers/axe";
import {
  E2E_LATE_ORDER_DRAWER_SUMMARY_PREFIX as SUMMARY_PREFIX,
  applyLateOrderDrawerToActiveSnapshot,
  deleteE2eStaffLateOrderRequests,
  restoreLateOrderDrawerFromActiveSnapshot,
} from "./helpers/e2e-ordering-fixture";
import { STAFF_SEED } from "./helpers/seed-fixtures";
const OFFICE_2_LOCATION_ID = "20000002-0002-4002-8002-000000000002";

/**
 * PRL-008 regression: late-order drawer focus, announcements and submission feedback.
 * Uses the local late-order fixture (real eligibility RPCs; local DB only). Restoring the fixture,
 * here or in global teardown after a failed run, also deletes the requests it created.
 */
test.describe("Staff late-order drawer — focus and feedback (PRL-008)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    applyLateOrderDrawerToActiveSnapshot();
    deleteE2eStaffLateOrderRequests(SUMMARY_PREFIX);
  });

  test.afterAll(() => {
    restoreLateOrderDrawerFromActiveSnapshot();
  });

  async function openDrawer(page: Page) {
    await page.goto("/lunch", { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: /Submit late order( for today)?/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.locator("[data-staff-modal-dialog]");
    await expect(dialog).toBeVisible();
    return { trigger, dialog };
  }

  test("opening focuses the drawer heading, not a form control", async ({ page }) => {
    const { dialog } = await openDrawer(page);
    await expect(dialog.getByRole("heading", { level: 2 })).toBeFocused();
    await page.waitForTimeout(500);
    await expect(dialog.getByRole("heading", { level: 2 })).toBeFocused();
  });

  test("Escape, Cancel and the close button return focus to the trigger", async ({ page }) => {
    const { trigger, dialog } = await openDrawer(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole("button", { name: "Close late order drawer" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the backdrop is not focusable", async ({ page }) => {
    const { dialog } = await openDrawer(page);
    const backdrop = dialog.locator("[data-late-order-drawer-backdrop]");
    await expect(backdrop).toHaveAttribute("aria-hidden", "true");
    await expect(backdrop).not.toHaveAttribute("tabindex", /.*/);
    expect(await backdrop.evaluate((el) => el.tagName.toLowerCase())).toBe("div");
  });

  test("changing location keeps focus and announces availability", async ({ page }) => {
    const { dialog } = await openDrawer(page);
    const location = dialog.getByLabel("Delivery location", { exact: true });
    const status = page.locator("[data-late-order-availability-status]");
    await expect(status).toHaveAttribute("role", "status");

    await location.focus();
    await location.selectOption(OFFICE_2_LOCATION_ID);
    await expect(status).toHaveText(/late-order (option|options|providers)/);
    await expect(location).toBeFocused();

    await location.selectOption(STAFF_SEED.staff1OfficeLocationId);
    await expect(status).toHaveText(/late-order options? (is|are) available/);
    await expect(location).toBeFocused();

    const deliveryDate = dialog.getByLabel("Delivery date", { exact: true });
    if (await deliveryDate.isVisible()) {
      await deliveryDate.focus();
      const values = await deliveryDate.locator("option").evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      );
      await deliveryDate.selectOption(values[values.length - 1]!);
      await expect(deliveryDate).toBeFocused();
    }
  });

  test("validation errors are focused and associated with the field", async ({ page }) => {
    const { dialog } = await openDrawer(page);
    await dialog.getByRole("button", { name: "Submit late order" }).click();
    const summary = dialog.getByLabel(/What I.d like/);
    await expect(summary).toHaveAttribute("aria-invalid", "true");
    const describedBy = (await summary.getAttribute("aria-describedby")) ?? "";
    expect(describedBy.length).toBeGreaterThan(0);
    const focused = dialog.locator(":focus");
    await expect(focused).toHaveText("Describe what you would like to order.");
    await expect(focused).not.toHaveAttribute("role", /.*/);
  });

  test("drawer has no axe violations", async ({ page }) => {
    await openDrawer(page);
    const results = await new AxeBuilder({ page })
      .withTags([...STAFF_AXE_WCAG_TAGS])
      .include("[data-staff-modal-dialog]")
      .analyze();
    expect(results.violations, formatAxeViolations(results)).toHaveLength(0);
  });

  test("submission shows pending state, blocks double submit and focuses success", async ({ page }) => {
    const { dialog } = await openDrawer(page);
    await dialog.getByLabel(/What I.d like/).fill(`${SUMMARY_PREFIX}focus check`);

    let createRequests = 0;
    await page.route("**/lunch**", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        const body = request.postData() ?? "";
        if (body.includes(SUMMARY_PREFIX)) {
          createRequests += 1;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      await route.continue();
    });

    const submit = dialog.locator("button[type=submit]");
    await submit.click();
    await expect(submit).toHaveText("Submitting…");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(submit).toHaveAttribute("aria-busy", "true");
    await submit.click({ force: true });

    const feedback = dialog.locator("[data-late-order-submission-feedback]");
    await expect(feedback).toBeFocused({ timeout: 20_000 });
    await expect(feedback).toContainText(/submitted/i);
    expect(createRequests).toBe(1);

    await page.waitForTimeout(1500);
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    expect(focusedLabel).toMatch(/late order/i);
  });
});
