import { test, expect } from "@playwright/test";

import {
  requireHrCredentials,
  requireOwnerCredentials,
  requireStaffCredentials,
} from "./helpers/env";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  cleanupE2eOperationalAttentionFixture,
  seedE2eOperationalAttentionFixture,
} from "./helpers/operational-attention-fixture";

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|admin|financials)/, { timeout: 30_000 });
}

test.describe("Operational attention bell", () => {
  test.beforeAll(() => {
    loadLocalEnvFiles();
    seedE2eOperationalAttentionFixture();
  });

  test.afterAll(() => {
    cleanupE2eOperationalAttentionFixture();
  });

  test("staff header does not show operational bell", async ({ page }) => {
    const { email, password } = requireStaffCredentials();
    await login(page, email, password);

    await expect(
      page.getByRole("button", { name: /Operational notifications/i }),
    ).toHaveCount(0);
  });

  test.describe("role logins", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("accounts header does not show operational bell", async ({ page }) => {
      const password = process.env.E2E_STAFF_PASSWORD;
      test.skip(!password, "E2E_STAFF_PASSWORD required for local seed accounts");

      await login(page, "accounts@lunch.test", password!);

      await expect(
        page.getByRole("button", { name: /Operational notifications/i }),
      ).toHaveCount(0);
    });

    test("HR bell shows seeded unread count and items", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      const bell = page.getByRole("button", {
        name: /Operational notifications, 2 unread notifications/i,
      });
      await expect(bell).toBeVisible();
      await bell.click();

      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("E2E operational notification one.")).toBeVisible();
      await expect(dialog.getByText("E2E operational notification two.")).toBeVisible();
    });

    test("Owner bell shows admin delivery failure item only", async ({ page }) => {
      const { email, password } = requireOwnerCredentials();
      await login(page, email, password);

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await bell.click();

      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await expect(dialog.getByText("E2E admin operational notification.")).toBeVisible();
      await expect(dialog.getByText("E2E operational notification one.")).toHaveCount(0);
    });

    test("Mark read and Mark all read update badge and styling", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await bell.click();

      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await dialog.getByRole("button", { name: "Mark as read" }).first().click();

      await expect(
        page.getByRole("button", {
          name: /Operational notifications, 1 unread notification/i,
        }),
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Mark all as read" }).click();

      await expect(
        page.getByRole("button", { name: "Operational notifications" }),
      ).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
    });

    test("workflow link navigates and closes popover", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      await page.getByRole("button", { name: /Operational notifications/i }).click();
      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await dialog.getByRole("link", { name: "Review approvals" }).first().click();

      await expect(page).toHaveURL(/\/admin\/users\?view=approvals/);
      await expect(dialog).toBeHidden();
    });

    test("Escape closes popover and restores bell focus", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      await page.setViewportSize({ width: 320, height: 640 });

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await bell.click();

      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await expect(dialog).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(bell).toBeFocused();
    });

    test("outside click closes popover", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await bell.click();

      const dialog = page.getByRole("dialog", { name: /Operational notifications/i });
      await expect(dialog).toBeVisible();

      await page.locator("#main-content").click({ position: { x: 8, y: 8 } });
      await expect(dialog).toBeHidden();
    });

    test("Support Mode does not expose HR notifications to Owner", async ({ page }) => {
      const { email, password } = requireOwnerCredentials();
      await login(page, email, password);

      await page.goto("/admin/support");
      await page.waitForLoadState("networkidle");

      const openBellDialog = page.getByRole("dialog", {
        name: /Operational notifications/i,
      });
      if (await openBellDialog.isVisible()) {
        await page.keyboard.press("Escape");
        await expect(openBellDialog).toBeHidden();
      }

      const exitSupport = page.getByRole("button", { name: "Exit Support Mode" });
      if (await exitSupport.isVisible()) {
        await exitSupport.click();
        await expect(exitSupport).toBeHidden({ timeout: 20_000 });
      }

      const hrSupportCard = page
        .getByRole("main")
        .getByRole("button", { name: /^HR Support\b/i });
      await expect(hrSupportCard).toBeVisible();
      await hrSupportCard.click();

      const supportReason = page.locator("#support-reason");
      await expect(supportReason).toBeVisible();
      await supportReason.fill("E2E operational bell isolation");
      await page.getByRole("button", { name: "Start Support Mode" }).click();

      await expect(page.getByRole("status")).toContainText(/Support Mode: HR/i, {
        timeout: 20_000,
      });

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await bell.click();

      const notificationsDialog = page.getByRole("dialog", {
        name: /Operational notifications/i,
      });
      await expect(notificationsDialog.getByText("E2E operational notification one.")).toHaveCount(
        0,
      );
      await expect(notificationsDialog.getByText("E2E admin operational notification.")).toBeVisible();

      await page.getByRole("button", { name: "Exit Support Mode" }).click();
      await expect(exitSupport).toBeHidden({ timeout: 20_000 });
    });

    test("offline inbox load shows retry UI and recovers", async ({ page, context }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      const bell = page.getByRole("button", { name: /Operational notifications/i });
      await context.setOffline(true);
      await bell.click();

      const notificationsDialog = page.getByRole("dialog", {
        name: /Operational notifications/i,
      });
      await expect(notificationsDialog.getByRole("alert")).toContainText(
        /Could not load notifications/i,
      );
      await expect(
        notificationsDialog.getByRole("button", { name: "Try again" }),
      ).toBeVisible();

      await context.setOffline(false);
      await notificationsDialog.getByRole("button", { name: "Try again" }).click();
      await expect(notificationsDialog.getByText("E2E operational notification one.")).toBeVisible({
        timeout: 20_000,
      });
    });

    test("200% and 400% zoom keep header controls usable", async ({ page }) => {
      const { email, password } = requireHrCredentials();
      await login(page, email, password);

      for (const scale of ["200%", "400%"]) {
        await page.evaluate((fontSize) => {
          document.documentElement.style.fontSize = fontSize;
        }, scale);

        const bell = page.getByRole("button", { name: /Operational notifications/i });
        await expect(bell).toBeVisible();
        await expect(page.getByRole("link", { name: /Dev HR|User/i }).first()).toBeVisible();
      }
    });
  });

  test("200% zoom keeps staff account menu visible", async ({ page }) => {
    const { email, password } = requireStaffCredentials();
    await login(page, email, password);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });

    await expect(page.getByRole("link", { name: /User|Staff/i }).first()).toBeVisible();
  });
});
