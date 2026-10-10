import { test, expect } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/axe";
import {
  applyHrRatingsPaginationE2eFixture,
  applyMenuItemRatingsStaffE2eFixture,
  restoreHrRatingsPaginationE2eFixture,
  restoreMenuItemRatingsStaffE2eFixture,
  loadLocalEnvFiles,
} from "./helpers/e2e-ordering-fixture";
import { requireHrCredentials, requireOwnerCredentials, requireStaffCredentials } from "./helpers/env";
import { STAFF_SHORT_VIEWPORT_HEIGHT } from "./helpers/layout";
import { STAFF_SEED } from "./helpers/seed-fixtures";

const ratingsPath = `/admin/providers/${STAFF_SEED.providerAlberries}/ratings`;

test.describe("HR ratings — Support Mode denial", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Owner in HR Support Mode cannot open ratings administration", async ({ page }) => {
    test.setTimeout(120_000);
    loadLocalEnvFiles();
    const { email, password } = requireOwnerCredentials();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });

    await page.goto("/admin/support", { waitUntil: "networkidle" });

    const exitSupport = page
      .locator("#main-content")
      .getByRole("button", { name: "Exit Support Mode" });
    if (await exitSupport.isVisible()) {
      await exitSupport.click();
      await expect(exitSupport).toBeHidden({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");
    }

    await expect(async () => {
      const exitButtons = page.getByRole("button", { name: "Exit Support Mode" });
      if (await exitButtons.first().isVisible()) {
        await exitButtons.first().click();
        await page.waitForLoadState("networkidle");
      }

      const hrSupport = page.locator("#main-content").getByRole("button", { name: /^HR Support\b/i });
      await expect(hrSupport).toBeVisible();
      await hrSupport.click();
      const reasonField = page.getByLabel("Reason for support access");
      await expect(reasonField).toBeVisible();
      await reasonField.fill("E2E HR ratings denial");
      await page.getByRole("dialog").getByRole("button", { name: "Start Support Mode" }).click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Support Mode: HR")).toBeVisible({ timeout: 30_000 });
    }).toPass({ timeout: 90_000 });

    await page.goto(ratingsPath);
    await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Alberries/i })).toHaveCount(0);

    await page.goto("/admin/support", { waitUntil: "networkidle" });
    const exitAfterTest = page.getByRole("button", { name: "Exit Support Mode" });
    if (await exitAfterTest.first().isVisible()) {
      await exitAfterTest.first().click();
      await page.waitForLoadState("networkidle");
    }
  });
});

async function loginHr(page: import("@playwright/test").Page) {
  const { email, password } = requireHrCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home)/, { timeout: 30_000 });
}

async function openRatingsPage(page: import("@playwright/test").Page) {
  await page.goto(ratingsPath, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: /Alberries/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("#staff-modal-layer")).toBeAttached();
}

test.describe("HR menu item ratings administration", () => {
  test.describe.configure({ mode: "serial" });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    loadLocalEnvFiles();
    applyMenuItemRatingsStaffE2eFixture();
  });

  test.afterAll(() => {
    restoreMenuItemRatingsStaffE2eFixture();
  });

  test.beforeEach(async ({ page }) => {
    await loginHr(page);
  });

  test("ratings page meets accessibility expectations", async ({ page }) => {
    await openRatingsPage(page);
    await expect(page.getByRole("heading", { level: 2, name: "Provider summary" })).toBeVisible();
    await expectNoAxeViolations(page, "/admin/providers ratings", { mainContentOnly: true });
  });

  test("breadcrumb navigation and provider list manage ratings entry", async ({ page }) => {
    await openRatingsPage(page);
    const nav = page.getByRole("navigation", { name: /breadcrumb/i });
    await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Lunch Providers" })).toBeVisible();
    await expect(nav.getByText("Manage ratings")).toBeVisible();

    await nav.getByRole("link", { name: "Lunch Providers" }).click();
    await expect(page).toHaveURL(/\/admin\/providers\/?$/);
    await expect(
      page.getByRole("link", { name: "Manage ratings" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Edit details and late-order settings")).toHaveCount(0);

    await page.getByRole("link", { name: "Manage ratings" }).first().click();
    await expect(page).toHaveURL(/\/ratings/);
  });

  test("narrow viewport reflow without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: STAFF_SHORT_VIEWPORT_HEIGHT });
    await openRatingsPage(page);
    const mainMetrics = await page.locator("#main-content").evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(mainMetrics.scrollWidth).toBeLessThanOrEqual(mainMetrics.clientWidth + 1);
    await expectNoAxeViolations(page, "/admin/providers ratings narrow", { mainContentOnly: true });
  });

  test("disable and re-enable ratings without reason field", async ({ page }) => {
    await openRatingsPage(page);

    const enable = page.locator("#main-content").getByRole("button", { name: "Enable ratings" });
    if (await enable.isVisible()) {
      await enable.click();
      const enableDialog = page.getByRole("dialog");
      await expect(enableDialog.getByRole("heading", { name: "Enable menu item ratings" })).toBeVisible({
        timeout: 20_000,
      });
      await enableDialog.getByRole("button", { name: "Enable ratings" }).last().click();
      await expect(page.locator("#main-content").getByRole("button", { name: "Disable ratings" })).toBeVisible({
        timeout: 15_000,
      });
    }

    const disable = page.locator("#main-content").getByRole("button", { name: "Disable ratings" });
    await expect(disable).toBeVisible();
    await disable.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Disable menu item ratings" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByLabel(/Reason/i)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Disable ratings" }).last().click();
    await expect(page.locator("#main-content").getByRole("button", { name: "Enable ratings" })).toBeVisible({
      timeout: 20_000,
    });

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#main-content").getByRole("button", { name: "Enable ratings" })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator("#main-content").getByRole("button", { name: "Enable ratings" }).click();
    const enableDialog = page.getByRole("dialog");
    await expect(enableDialog.getByRole("heading", { name: "Enable menu item ratings" })).toBeVisible({
      timeout: 20_000,
    });
    await enableDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });

    await page.locator("#main-content").getByRole("button", { name: "Enable ratings" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable ratings" }).last().click();
    await expect(page.locator("#main-content").getByRole("button", { name: "Disable ratings" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("reset dialogs confirm without mandatory reasons and support keyboard focus", async ({
    page,
  }) => {
    await openRatingsPage(page);

    await page
      .locator("#main-content")
      .getByRole("button", { name: "Reset all ratings" })
      .click();
    const resetAllDialog = page.getByRole("dialog");
    await expect(
      resetAllDialog.getByRole("heading", { name: "Reset all ratings for this provider?" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      resetAllDialog.getByRole("heading", { name: "Reset all ratings for this provider?" }),
    ).toBeFocused();
    await expect(resetAllDialog.getByLabel("Reason for reset (optional)")).toBeVisible();

    await resetAllDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(resetAllDialog).toBeHidden();

    const resetItem = page.getByRole("button", { name: "Reset item" }).first();
    await resetItem.click();
    const resetItemDialog = page.getByRole("dialog");
    await expect(resetItemDialog.getByRole("heading", { name: /Reset ratings for/i })).toBeVisible();
    await expect(resetItemDialog.getByLabel(/Reason/i)).toHaveCount(0);
    await resetItemDialog.getByRole("button", { name: "Reset menu item" }).last().click();
    await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("provider summary shows focal average card and collapsible activity log", async ({ page }) => {
    await openRatingsPage(page);
    await expect(page.getByText("Provider average")).toBeVisible();
    const providerAverageVisual = page
      .getByRole("img", { name: /Provider average/i })
      .or(page.getByText("No ratings yet for this assessment period."));
    await expect(providerAverageVisual).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Rating activity log" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View rating activity" })).toBeVisible();
    await page.getByRole("button", { name: "View rating activity" }).click();
    await expect(page.getByRole("button", { name: "Hide rating activity" })).toBeVisible();
    const itemAverageStar = page.getByRole("img", { name: /of 5 stars average/i }).first();
    const itemAverageEmpty = page.getByLabel("No ratings").first();
    await expect(itemAverageStar.or(itemAverageEmpty)).toBeVisible();
  });

  test("closing confirmation dialog preserves scroll position", async ({ page }) => {
    await openRatingsPage(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const resetButton = page.locator("#main-content").getByRole("button", { name: "Reset all ratings" });
    await resetButton.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await resetButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(scrollBefore - 2);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThanOrEqual(scrollBefore + 2);
  });

  test("individual ratings paginate with 20 per page and refresh after removal", async ({ page }) => {
    test.setTimeout(120_000);
    applyHrRatingsPaginationE2eFixture(105);
    try {
      await openRatingsPage(page);
      await page.getByRole("button", { name: "View ratings" }).first().click();
      await expect(
        page.getByText(/Page 1 of 6 · 105 records in this generation/),
      ).toBeVisible({ timeout: 20_000 });
      const ratingRows = page.locator("#main-content ul.space-y-3 > li");
      await expect(ratingRows).toHaveCount(20);

      const detailPaginationBar = page
        .getByText(/Page 1 of 6 · 105 records in this generation/)
        .locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
      const firstPageTop = await ratingRows.first().locator("p.font-medium").textContent();
      await detailPaginationBar.getByRole("button", { name: "Next" }).click();
      await expect(
        page.getByText(/Page 2 of 6 · 105 records in this generation/),
      ).toBeVisible({ timeout: 20_000 });
      await expect(ratingRows).toHaveCount(20);
      const secondPageTop = await ratingRows.first().locator("p.font-medium").textContent();
      expect(secondPageTop).not.toEqual(firstPageTop);

      await page
        .getByText(/Page 2 of 6 · 105 records in this generation/)
        .locator("xpath=ancestor::div[contains(@class,'border-t')][1]")
        .getByRole("button", { name: "Previous" })
        .click();
      await expect(page.getByText(/Page 1 of 6 · 105 records in this generation/)).toBeVisible();

      const remove = ratingRows.getByRole("button", { name: "Remove" }).first();
      await remove.click();
      await page.getByRole("dialog").getByRole("button", { name: "Remove rating" }).last().click();
      await expect(page.getByText("Changes saved.")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Removed from averages").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/105 records in this generation \(104 active in averages/)).toBeVisible();

      await page.getByRole("button", { name: "View rating activity" }).click();
      await expect(page.getByText("Removed rating").first()).toBeVisible({ timeout: 20_000 });
    } finally {
      restoreHrRatingsPaginationE2eFixture();
    }
  });

  test("staff rating can be removed without a reason when present", async ({ page, browser }) => {
    const { email, password } = requireStaffCredentials();
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto("/login");
    await staffPage.getByLabel("Email").fill(email);
    await staffPage.getByLabel("Password").fill(password);
    await staffPage.getByRole("button", { name: "Sign in" }).click();
    await staffPage.waitForURL(/\/(home|lunch|my-orders)/, { timeout: 30_000 });
    await staffPage.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const stars = staffPage.getByRole("radio", { name: "4 stars" }).first();
    if (await stars.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await stars.click();
      await expect(staffPage.getByRole("status").filter({ hasText: /Saved 4/i })).toBeVisible({
        timeout: 15_000,
      });
    }
    await staffContext.close();

    await openRatingsPage(page);
    await page.getByRole("button", { name: "View ratings" }).first().click();
    const remove = page.getByRole("button", { name: "Remove" }).first();
    if (await remove.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await remove.click();
      const removeDialog = page.getByRole("dialog");
      await expect(removeDialog.getByRole("heading", { name: "Remove staff rating" })).toBeVisible();
      await expect(removeDialog.getByLabel(/Reason/i)).toHaveCount(0);
      await removeDialog.getByRole("button", { name: "Remove rating" }).last().click();
      await expect(page.getByText("Changes saved.")).toBeVisible({ timeout: 15_000 });
    }
  });
});
