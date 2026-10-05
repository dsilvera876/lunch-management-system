import { test, expect } from "@playwright/test";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import {
  expectNoUnintendedHorizontalPageScroll,
  STAFF_SHORT_VIEWPORT_HEIGHT,
} from "./helpers/layout";

test.describe("Staff reflow and viewport smoke", () => {
  test("desktop — no unintended horizontal page scroll on /lunch", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectNoUnintendedHorizontalPageScroll(page);
    await expect(page.getByRole("button", { name: "Place Order" })).toBeVisible();
  });

  test("375px — lunch layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectNoUnintendedHorizontalPageScroll(page);
    await expect(page.getByRole("tablist", { name: "Lunch providers" })).toBeVisible();
  });

  test("320px — provider tab strip scrolls, page does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectNoUnintendedHorizontalPageScroll(page);
    const tablist = page.getByRole("tablist", { name: "Lunch providers" });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole("tab").first()).toBeVisible();
  });

  test("320px — past order date value visible (not clipped)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/my-orders");
    await page.getByRole("tab", { name: "Past Orders" }).click();
    const value = page.locator("#past-order-date-value");
    await expect(value).toBeVisible();
    const box = await value.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  });

  test("short desktop height — cart Place Order reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: STAFF_SHORT_VIEWPORT_HEIGHT });
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await placeOrder.scrollIntoViewIfNeeded();
    await expect(placeOrder).toBeVisible();
    await expectNoUnintendedHorizontalPageScroll(page);
  });

  test("short desktop height — edit order submit not overlaying special instructions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: STAFF_SHORT_VIEWPORT_HEIGHT });
    await page.goto(`/lunch/orders/${STAFF_SEED.upcomingOrderId}?edit=1`);
    await expect(page.getByRole("heading", { name: /not found/i })).toHaveCount(0);
    const instructions = page.getByRole("textbox", { name: /Special instructions/i });
    await expect(instructions).toBeVisible();
    await instructions.scrollIntoViewIfNeeded();
    const submit = page.getByRole("button", { name: "Save changes" });
    await submit.scrollIntoViewIfNeeded();
    const instrBox = await instructions.boundingBox();
    const submitBox = await submit.boundingBox();
    if (instrBox && submitBox) {
      expect(submitBox.y).toBeGreaterThanOrEqual(instrBox.y + instrBox.height - 2);
    }
  });
});

test.describe("Staff reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("lunch page functions with reduced motion preference", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expect(page.getByRole("tablist", { name: "Lunch providers" })).toBeVisible();
    const reducedMotionActive = await page.evaluate(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reducedMotionActive).toBe(true);
  });
});

test.describe("Staff forced colors smoke (Chromium)", () => {
  test("selected provider tab and focus remain visible under forced-colors", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Forced-colors emulation validated on Chromium");

    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const selectedTab = page.getByRole("tab", { selected: true });
    await expect(selectedTab).toBeVisible();
    await selectedTab.focus();
    await expect(selectedTab).toBeFocused();
  });
});
