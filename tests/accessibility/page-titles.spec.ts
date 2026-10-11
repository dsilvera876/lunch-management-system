import { test, expect, type Page } from "@playwright/test";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  requireHrCredentials,
  requireOwnerCredentials,
  requireStaffCredentials,
} from "./helpers/env";

const SUFFIX = " | Lunch Management System";

/** Must never appear in a title: seeded names and emails used across these roles. */
const PERSONAL_DATA_PATTERN = /@|lunch\.test|staff1|Owner User|HR User/i;

async function signIn(page: Page, credentials: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/home/, { timeout: 30_000 });
}

async function expectRouteTitle(page: Page, path: string, name: string) {
  await page.goto(path);
  expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
  await expect(page).toHaveTitle(`${name}${SUFFIX}`);
  expect(await page.title()).not.toMatch(PERSONAL_DATA_PATTERN);
}

/** PRL-009 regression: descriptive, non-personal titles that update on client navigation. */
test.describe("Page titles (PRL-009)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    loadLocalEnvFiles();
  });

  test("public routes", async ({ page }) => {
    await expectRouteTitle(page, "/login", "Sign in");
    await expectRouteTitle(page, "/signup", "Create account");
    await expectRouteTitle(page, "/forgot-password", "Reset password");
  });

  test("Staff routes, including client-side navigation", async ({ page }) => {
    await signIn(page, {
      email: "staff1@lunch.test",
      password: requireStaffCredentials().password,
    });
    await expect(page).toHaveTitle(`Home${SUFFIX}`);

    const nav = page.getByRole("navigation").first();
    await nav.getByRole("link", { name: "My Orders" }).click();
    await page.waitForURL(/\/my-orders/);
    await expect(page).toHaveTitle(`My Orders${SUFFIX}`);

    await nav.getByRole("link", { name: "Today's Order" }).click();
    await page.waitForURL(/\/lunch/);
    await expect(page).toHaveTitle(`Today's Order${SUFFIX}`);

    await expectRouteTitle(page, "/financials", "My Spend");
    await expectRouteTitle(page, "/account", "Preferences");
  });

  test("HR routes", async ({ page }) => {
    await signIn(page, requireHrCredentials());
    await expectRouteTitle(page, "/admin/todays-orders", "Today's Orders");
    await expectRouteTitle(page, "/admin/late-orders", "Late Orders");
    await expectRouteTitle(page, "/admin/users", "User Management");
    await expectRouteTitle(page, "/admin/providers", "Lunch Providers");
    await expectRouteTitle(page, "/admin/orders", "Order History");
  });

  test("Accounts routes", async ({ page }) => {
    await signIn(page, {
      email: process.env.E2E_ACCOUNTS_EMAIL?.trim() || "accounts@lunch.test",
      password: requireStaffCredentials().password,
    });
    await expectRouteTitle(page, "/admin/financials", "Financial Reports");
  });

  test("Owner and Admin routes", async ({ page }) => {
    await signIn(page, requireOwnerCredentials());
    await expectRouteTitle(page, "/admin/settings/system", "Admin Settings");
    await expectRouteTitle(page, "/admin/support", "Support Mode");
    await expectRouteTitle(page, "/admin/settings/authentication", "Authentication");
    await expectRouteTitle(page, "/admin/settings/email", "Email Settings");
  });
});
