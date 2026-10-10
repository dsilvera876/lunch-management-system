import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import {
  applyMenuItemRatingsStaffE2eFixture,
  restoreMenuItemRatingsStaffE2eFixture,
} from "./helpers/e2e-ordering-fixture";
import { expectProviderOrderingReady } from "./helpers/staff-page";

test.describe("Menu item ratings — Staff UI", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    applyMenuItemRatingsStaffE2eFixture();
  });

  test.afterAll(() => {
    restoreMenuItemRatingsStaffE2eFixture();
  });

  test("lunch menu shows community rating and your rating controls", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);

    await expect(page.getByText("Your rating").first()).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: /Your rating for/i }).first()).toBeVisible();

    await expectNoAxeViolations(page, "/lunch menu item ratings", { mainContentOnly: true });
  });

  test("my orders past checkout exposes rateable menu item controls", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    await expect(page.getByRole("heading", { name: "My Orders" })).toBeVisible();

    const yourRating = page.getByText("Your rating").first();
    await expect(yourRating).toBeVisible({ timeout: 20_000 });

    const stars = page.getByRole("radio", { name: /4 stars/i }).first();
    await stars.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status").filter({ hasText: /Saved 4 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });

    await expectNoAxeViolations(page, "/my-orders menu item ratings", { mainContentOnly: true });
  });

  test("home dashboard lists recent rateable menu items", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Rate Recent Orders/i })).toBeVisible();
    await expect(page.getByText("Your rating").first()).toBeVisible({ timeout: 20_000 });
    await expectNoAxeViolations(page, "/home menu item ratings", { mainContentOnly: true });
  });
});
