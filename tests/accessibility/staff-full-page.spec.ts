import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import { expectProviderOrderingReady } from "./helpers/staff-page";

const FULL_PAGE_ROUTES = [
  { path: "/home", ready: /Welcome back/i },
  { path: "/lunch", ready: "Today's Order" },
  { path: "/my-orders", ready: "My Orders" },
  { path: "/account", ready: "Preferences" },
] as const;

test.describe("Staff routes — full-page axe baseline", () => {
  for (const route of FULL_PAGE_ROUTES) {
    test(`${route.path} includes AppShell chrome`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.ready })).toBeVisible();
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
      await expectNoAxeViolations(page, `${route.path} full page`, { fullPage: true });
    });
  }

  test("/lunch with provider — full page", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    await expect(page.getByRole("tab", { name: /Alberries/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectNoAxeViolations(page, "/lunch provider full page", { fullPage: true });
  });
});
