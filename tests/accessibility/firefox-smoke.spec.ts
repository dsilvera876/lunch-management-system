import { test, expect } from "@playwright/test";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import { expectLocationPicker, expectProviderOrderingReady } from "./helpers/staff-page";
import { expectNoAxeViolations } from "./helpers/axe";

test.describe("Firefox Staff accessibility smoke", () => {
  test("lunch — provider tab keyboard", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    const tab = page.getByRole("tab", { name: /Alberries/i });
    await tab.focus();
    await expect(tab).toBeFocused();
  });

  test("lunch — location dialog Escape returns focus", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectLocationPicker(page);
    const change = page.getByRole("button", { name: /· Change|· Choose/i }).first();
    await change.click();
    await page.keyboard.press("Escape");
    await expect(change).toBeFocused();
  });

  test("my-orders — tabs and past date trigger", async ({ page }) => {
    await page.goto("/my-orders");
    await page.getByRole("tab", { name: "Past Orders" }).click();
    await expect(page.getByRole("button", { name: /Select date/i })).toBeVisible();
  });

  test("home — representative axe scan", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expectNoAxeViolations(page, "/home firefox smoke", { mainContentOnly: true });
  });
});
