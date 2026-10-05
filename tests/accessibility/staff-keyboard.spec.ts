import { test, expect } from "@playwright/test";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import {
  expectLocationPicker,
  expectProviderOrderingReady,
} from "./helpers/staff-page";

test.describe("Staff keyboard regression", () => {
  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/home");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("provider tabs — arrows, Home, End, single tabpanel", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    const tablist = page.getByRole("tablist", { name: "Lunch providers" });
    const tabs = tablist.getByRole("tab");
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    const first = tabs.first();
    const last = tabs.last();
    await first.click();
    await first.press("End");
    await expect(last).toBeFocused();
    await expect(last).toHaveAttribute("aria-selected", "true");

    await last.press("Home");
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-selected", "true");

    await first.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();

    await expect(page.locator("#lunch-provider-menu-tabpanel")).toHaveCount(1);
  });

  test("my orders tabs — keyboard navigation", async ({ page }) => {
    await page.goto("/my-orders");
    const upcoming = page.getByRole("tab", { name: "Upcoming" });
    const past = page.getByRole("tab", { name: "Past Orders" });
    await upcoming.click();
    await upcoming.press("ArrowRight");
    await expect(past).toBeFocused();
    await expect(past).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#my-orders-tabpanel")).toHaveCount(1);
  });

  test("location dialog — focus trap, Escape, focus return", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectLocationPicker(page);
    const change = page.getByRole("button", { name: /· Change|· Choose/i }).first();
    await change.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("select, button, input").first()).toBeFocused();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(change).toBeFocused();
  });

  test("aria-disabled Place Order does not submit checkout", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await expect(placeOrder).toHaveAttribute("aria-disabled", "true");
    await placeOrder.click({ force: true });
    await expect(page).toHaveURL(/\/lunch/);
    await expect(page.getByRole("status").first()).toBeVisible();
  });

  test("aria-disabled side Add stays inactive without a main", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const blockedSide = page.locator('button[aria-disabled="true"][aria-label^="Add "]').first();
    await expect(blockedSide).toBeVisible();
    await blockedSide.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(blockedSide).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /added to your order/i })).toHaveCount(0);
  });
});
