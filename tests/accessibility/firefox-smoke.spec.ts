import { test, expect } from "@playwright/test";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import { expectProviderOrderingReady } from "./helpers/staff-page";
import { expectNoAxeViolations } from "./helpers/axe";
import {
  applyLocalStaffOrderingFixture,
  applyMostPopularMenuItemE2eFixture,
  clearFixtureSnapshotFile,
  readFixtureSnapshot,
  restoreLocalStaffOrderingFixture,
  restoreMenuItemRatingsStaffE2eFixture,
  restoreMostPopularMenuItemE2eFixture,
} from "./helpers/e2e-ordering-fixture";
import { applySimulatedJamaicaToday } from "./helpers/simulated-weekday";

function ensureOpenOrderingForLunchMenuTests() {
  try {
    applyLocalStaffOrderingFixture();
  } catch {
    const snapshot = readFixtureSnapshot();
    if (snapshot) {
      restoreLocalStaffOrderingFixture(snapshot);
      clearFixtureSnapshotFile();
    }
    applyLocalStaffOrderingFixture();
  }
}

test.beforeEach(async ({ context }) => {
  await applySimulatedJamaicaToday(context);
});

test.describe("Firefox Staff accessibility smoke", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    applyMostPopularMenuItemE2eFixture();
    ensureOpenOrderingForLunchMenuTests();
  });

  test.afterAll(() => {
    restoreMostPopularMenuItemE2eFixture();
    restoreMenuItemRatingsStaffE2eFixture();
  });

  test("lunch — provider tab keyboard", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    const tab = page.getByRole("tab", { name: /Alberries/i });
    await tab.focus();
    await expect(tab).toBeFocused();
  });

  test("lunch — location dialog Escape returns focus", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    const change = page
      .getByRole("button", { name: /Change delivery location|Choose delivery location/i })
      .first();
    await expect(change).toBeVisible();
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

  test("menu item ratings — lunch read-only averages and my-orders keyboard", async ({ page }) => {
    await page.goto(`/lunch?provider=${STAFF_SEED.providerAlberries}`);
    await expectProviderOrderingReady(page);
    await expect(page.getByRole("radiogroup", { name: /Your rating for/i })).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: /average · \d+ rating/i }).first(),
    ).toBeVisible();
    await expectNoAxeViolations(page, "/lunch menu item ratings firefox", {
      mainContentOnly: true,
    });

    await page.goto("/my-orders?tab=past");
    const group = page.getByRole("radiogroup", { name: /Your rating for/i }).first();
    await expect(group).toBeVisible({ timeout: 30_000 });
    await group.getByRole("radio", { name: "3 stars" }).focus();
    await expect(group.getByRole("radio", { name: "3 stars" })).toBeFocused();
  });
});
