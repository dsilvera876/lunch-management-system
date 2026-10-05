import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import { expectProviderOrderingReady } from "./helpers/staff-page";

test.describe("Staff pages — axe WCAG scans", () => {
  test("home dashboard", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expectNoAxeViolations(page, "/home", { mainContentOnly: true });
  });

  test("home — late order panel open when entry is available", async ({ page }) => {
    await page.goto("/home");
    const openButton = page.getByRole("button", { name: "Request a late order" });
    if (!(await openButton.isVisible())) {
      test.skip(true, "Late order entry not available for current seed/timing");
    }
    await openButton.click();
    await expect(page.getByRole("combobox", { name: /Delivery date & provider/i })).toBeVisible();
    await expectNoAxeViolations(page, "/home late-order form open", { mainContentOnly: true });
    await page.getByRole("button", { name: "Close" }).click();
  });

  test("lunch — initial ordering screen", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expect(page.getByRole("heading", { name: "Today's Order" })).toBeVisible();
    await expectNoAxeViolations(page, "/lunch initial", { mainContentOnly: true });
  });

  test("lunch — provider selected via query", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    await expect(page.getByRole("tab", { name: /Alberries/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#lunch-provider-menu-tabpanel")).toBeVisible();
    await expectNoAxeViolations(page, "/lunch provider selected", { mainContentOnly: true });
  });

  test("lunch — cart guidance without placing order", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await expect(placeOrder).toBeVisible();
    await expect(placeOrder).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("status").first()).toBeVisible();
    await expectNoAxeViolations(page, "/lunch place-order guidance", { mainContentOnly: true });
  });

  test("lunch — add main to in-progress draft (no checkout submit)", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    const addButtons = page.getByRole("button", { name: /^Add / });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();
    await expect(page.getByRole("button", { name: /added to your order/i }).first()).toBeVisible();
    await expectNoAxeViolations(page, "/lunch cart with draft item", { mainContentOnly: true });
  });

  test("my-orders — upcoming tab", async ({ page }) => {
    await page.goto("/my-orders");
    await expect(page.getByRole("tab", { name: "Upcoming" })).toHaveAttribute("aria-selected", "true");
    await expectNoAxeViolations(page, "/my-orders upcoming", { mainContentOnly: true });
  });

  test("my-orders — past tab and date trigger", async ({ page }) => {
    await page.goto("/my-orders");
    await page.getByRole("tab", { name: "Past Orders" }).click();
    await expect(page.getByRole("tab", { name: "Past Orders" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /Select date/i })).toBeVisible();
    await expectNoAxeViolations(page, "/my-orders past", { mainContentOnly: true });
  });

  test("my-orders — past calendar dialog open", async ({ page }) => {
    await page.goto("/my-orders");
    await page.getByRole("tab", { name: "Past Orders" }).click();
    await page.getByRole("button", { name: /Select date/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page, "/my-orders past calendar open", {
      mainContentOnly: true,
    });
    await page.keyboard.press("Escape");
  });

  test("account — preferences and location", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
    await expectNoAxeViolations(page, "/account", { mainContentOnly: true });
  });

  test("financials — My Spend", async ({ page }) => {
    await page.goto("/financials");
    await expect(page.getByRole("heading", { name: "My Spend" })).toBeVisible();
    await expectNoAxeViolations(page, "/financials", { mainContentOnly: true });
  });

  test("order detail / edit route when seeded order exists", async ({ page }) => {
    await page.goto(`/lunch/orders/${STAFF_SEED.upcomingOrderId}`);
    await expect(page.getByRole("heading", { name: /not found/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page, `/lunch/orders/${STAFF_SEED.upcomingOrderId}`, {
      mainContentOnly: true,
    });
  });
});
