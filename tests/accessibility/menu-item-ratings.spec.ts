import { test, expect, devices } from "@playwright/test";
import path from "node:path";
import { expectNoAxeViolations } from "./helpers/axe";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import {
  applyMenuItemRatingsStaffE2eFixture,
  ensureMenuItemRatingRpcGrantedForLocalE2e,
  loadLocalEnvFiles,
  restoreMenuItemRatingsStaffE2eFixture,
} from "./helpers/e2e-ordering-fixture";
import { runLocalDbExec } from "./helpers/e2e-local-db";
import { expectProviderOrderingReady } from "./helpers/staff-page";

const weekendSafeRatingsRun = process.env.PLAYWRIGHT_MENU_ITEM_RATINGS_ONLY === "1";
const staffAuthFile = path.join(__dirname, ".auth/staff.json");

test.describe("Menu item ratings — Staff UI", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    loadLocalEnvFiles();
    applyMenuItemRatingsStaffE2eFixture();
  });

  test.afterAll(() => {
    restoreMenuItemRatingsStaffE2eFixture();
  });

  test("lunch menu shows community rating and your rating controls", async ({ page }) => {
    test.skip(
      weekendSafeRatingsRun,
      "Weekend-safe ratings run uses home/my-orders only (no open-ordering fixture).",
    );

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

    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    const star4 = group.getByRole("radio", { name: "4 stars" });
    await star4.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status").filter({ hasText: /Saved 4 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });

    await expectNoAxeViolations(page, "/my-orders menu item ratings", { mainContentOnly: true });
  });

  test("hover previews rating and pointer leave restores saved value", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    await expect(page.getByRole("radiogroup", { name: /Your rating for/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    const committed = await group.getAttribute("data-rating-stars-value");

    const star5 = group.getByRole("radio", { name: "5 stars" });
    await star5.hover();
    await expect(group).toHaveAttribute("data-rating-stars-preview", "5");

    await group.getByRole("radio", { name: "1 star" }).hover();
    await expect(group).toHaveAttribute("data-rating-stars-preview", "1");

    await page.locator("#main-content").getByRole("heading", { name: "My Orders" }).hover();
    await expect(group).toHaveAttribute("data-rating-stars-preview", "");
    if (committed) {
      await expect(group).toHaveAttribute("data-rating-stars-value", committed);
    }
  });

  test("arrow keys preview without saving until Enter", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    await group.getByRole("radio", { name: "2 stars" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group).toHaveAttribute("data-rating-stars-preview", "3");
    await expect(group.locator(".sr-only")).toContainText(/Previewing 3 of 5 stars/i);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: /Saved 3 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(group).toHaveAttribute("data-rating-stars-value", "3");
  });

  test("click immediately saves and allows a rapid follow-up edit", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    await group.getByRole("radio", { name: "3 stars" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Saved 3 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });

    await group.getByRole("radio", { name: "5 stars" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Saved 5 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(group).toHaveAttribute("data-rating-stars-value", "5");
  });

  test("rapid selections while a save is in flight keep the latest choice", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    await group.getByRole("radio", { name: "2 stars" }).click();
    await group.getByRole("radio", { name: "5 stars" }).click();

    await expect(page.getByRole("status").filter({ hasText: /Saved 5 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(group).toHaveAttribute("data-rating-stars-value", "5");
  });

  test("failed save restores committed stars and exposes an alert", async ({ page }) => {
    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    const committed = (await group.getAttribute("data-rating-stars-value")) ?? "4";

    runLocalDbExec(`
      do $revoke$
      begin
        revoke execute on function public.upsert_my_menu_item_rating(uuid, integer) from authenticated;
      end;
      $revoke$;
    `);

    try {
      await group.getByRole("radio", { name: "1 star" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /Unable to save/i })).toBeVisible({
        timeout: 20_000,
      });
      await expect(group).toHaveAttribute("data-rating-stars-value", committed);
      await expect(
        page.getByRole("status").filter({ hasText: /Saved 1 of 5 stars/i }),
      ).toHaveCount(0);
    } finally {
      ensureMenuItemRatingRpcGrantedForLocalE2e();
    }
  });

  test("touch tap commits a rating", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      storageState: staffAuthFile,
    });
    const page = await context.newPage();
    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    await group.getByRole("radio", { name: "2 stars" }).tap();
    await expect(page.getByRole("status").filter({ hasText: /Saved 2 of 5 stars/i })).toBeVisible({
      timeout: 20_000,
    });
    await context.close();
  });

  test("home dashboard lists main-only recent rateable menu items", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Rate Recent Orders/i })).toBeVisible();
    await expect(page.getByText("Your rating").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Plain Rice")).toHaveCount(0);
    await expect(page.getByText("BBQ Chicken").first()).toBeVisible();
    await expectNoAxeViolations(page, "/home menu item ratings", { mainContentOnly: true });
  });
});
