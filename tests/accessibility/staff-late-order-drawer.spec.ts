import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { STAFF_AXE_WCAG_TAGS, formatAxeViolations } from "./helpers/axe";
import {
  applyLateOrderDrawerToActiveSnapshot,
  restoreLateOrderDrawerFromActiveSnapshot,
} from "./helpers/e2e-ordering-fixture";

/**
 * Runs in the chromium-late-order-a11y project after open-ordering scans complete.
 * Mutates local DB only; beforeAll/afterAll snapshot exact values and restore on failure.
 */
test.describe("Staff late-order drawer — axe (local fixture)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    applyLateOrderDrawerToActiveSnapshot();
  });

  test.afterAll(() => {
    restoreLateOrderDrawerFromActiveSnapshot();
  });

  test("home — late order CTA routes to Today's Order when eligible", async ({ page }) => {
    await page.goto("/home");
    const lateOrderLink = page.getByRole("link", {
      name: /Submit late order( for today)?/,
    });
    await expect(lateOrderLink).toBeVisible();
    await expect(lateOrderLink).toHaveAttribute("href", "/lunch?lateOrder=1");
  });

  test("lunch — late order drawer opens when entry is available", async ({ page }) => {
    await page.goto("/lunch");
    const trigger = page.getByRole("button", {
      name: /Submit late order( for today)?/,
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.locator("[data-staff-modal-dialog]");
    await expect(dialog).toBeVisible();
    const axeResults = await new AxeBuilder({ page })
      .withTags([...STAFF_AXE_WCAG_TAGS])
      .include("[data-staff-modal-dialog]")
      .analyze();
    expect(
      axeResults.violations,
      `/lunch late-order drawer — axe violations:\n${formatAxeViolations(axeResults)}`,
    ).toHaveLength(0);
    await page.getByRole("button", { name: "Close late order drawer" }).first().click();
  });
});
