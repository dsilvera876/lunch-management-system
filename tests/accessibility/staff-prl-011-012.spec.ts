import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import { applySimulatedJamaicaToday } from "./helpers/simulated-weekday";
import { STAFF_SEED } from "./helpers/seed-fixtures";

const lunchUrl = `/lunch?provider=${STAFF_SEED.providerAlberries}`;

/** PRL-011 and PRL-012 regression on Staff lunch ordering (local auth). */
test.describe("Staff PRL-011 and PRL-012", () => {
  test.beforeEach(async ({ context }) => {
    await applySimulatedJamaicaToday(context);
  });

  test("sign-in form fields pass axe contrast", async ({ page }) => {
    await page.goto("/login");
    await expectNoAxeViolations(page, "/login form fields");
  });

  test("lunch page passes axe contrast when ordering is available", async ({ page }) => {
    await page.goto(lunchUrl, { waitUntil: "networkidle" });
    const addFirst = page.getByRole("button", { name: /^Add / }).first();
    if (!(await addFirst.isVisible().catch(() => false))) {
      test.skip(true, "Ordering closed; run Mon–Fri or with PLAYWRIGHT_SIMULATED_WEEKDAY=1.");
    }
    await expectNoAxeViolations(page, "/lunch provider menu", { mainContentOnly: true });
  });

  test("cart remove controls and delivery location change have descriptive names", async ({
    page,
  }) => {
    await page.goto(lunchUrl, { waitUntil: "networkidle" });
    const addFirst = page.getByRole("button", { name: /^Add / }).first();
    if (!(await addFirst.isVisible().catch(() => false))) {
      test.skip(true, "Ordering closed; run Mon–Fri or with PLAYWRIGHT_SIMULATED_WEEKDAY=1.");
    }
    await addFirst.click();

    const removeLine = page.getByRole("button", { name: /Remove .+ from .+ order$/ }).first();
    await expect(removeLine).toBeVisible();

    const locationChange = page.getByRole("button", {
      name: /Change delivery location|Choose delivery location/,
    });
    await expect(locationChange).toBeVisible();
    await expect(locationChange).not.toHaveAccessibleName(/^· Change$/);
  });

  test("account link has a meaningful name on narrow viewports", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home", { waitUntil: "networkidle" });
    const account = page.getByRole("link", { name: /Account settings,/ });
    await expect(account).toBeVisible();
    await expect(account).not.toHaveAccessibleName(/^[A-Z]{1,2}$/);
  });
});
