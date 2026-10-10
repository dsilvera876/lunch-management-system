import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import {
  applyMostPopularMenuItemE2eFixture,
  restoreMostPopularMenuItemE2eFixture,
  loadLocalEnvFiles,
} from "./helpers/e2e-ordering-fixture";
import { requireStaffCredentials } from "./helpers/env";
import { runLocalDbExec } from "./helpers/e2e-local-db";

async function expectMostPopularBadgeVisible(page: import("@playwright/test").Page) {
  const badge = page.getByText("Most Popular", { exact: true }).first();
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await expect(badge).toHaveAttribute("class", /amber/);
  return badge;
}

test.describe("Menu item Most Popular badge", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    loadLocalEnvFiles();
    applyMostPopularMenuItemE2eFixture();
  });

  test.afterAll(() => {
    restoreMostPopularMenuItemE2eFixture();
  });

  test("shows accessible Most Popular badge on home and my-orders", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Rate Recent Orders" })).toBeVisible({
      timeout: 20_000,
    });
    await expectMostPopularBadgeVisible(page);
    await expectNoAxeViolations(page, "/home most popular badge", { mainContentOnly: true });

    await page.goto("/my-orders");
    await page.getByRole("tab", { name: "Past Orders" }).click();
    await expectMostPopularBadgeVisible(page);
    await expectNoAxeViolations(page, "/my-orders most popular badge", { mainContentOnly: true });
  });

  test("second staff account loads ratings UI without errors", async ({ browser }) => {
    const { password } = requireStaffCredentials();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill("staff2@lunch.test");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(home|lunch|my-orders)/, { timeout: 30_000 });

    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Rate Recent Orders" })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoAxeViolations(page, "/home staff2 ratings", { mainContentOnly: true });
    await context.close();
  });

  test("hides badge when provider ratings are disabled", async ({ page }) => {
    await page.goto("/home");
    await expectMostPopularBadgeVisible(page);

    runLocalDbExec(`
      update public.lunch_providers
      set ratings_enabled = false
      where id = '${STAFF_SEED.providerAlberries}'::uuid
    `);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Most Popular")).toHaveCount(0);
    await expect(page.getByText("Your rating")).toHaveCount(0);

    runLocalDbExec(`
      update public.lunch_providers
      set ratings_enabled = true
      where id = '${STAFF_SEED.providerAlberries}'::uuid
    `);
  });
});
