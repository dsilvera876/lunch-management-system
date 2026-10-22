import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  hasOwnerCredentials,
  requireHrCredentials,
  requireOwnerCredentials,
} from "./helpers/env";
import {
  assertLocalSupportModeFixture,
  closeActiveSupportModeFixtureSession,
  expireActiveSupportModeFixtureSession,
  getLatestSupportModeFixtureSession,
  getSupportModeFixtureSessionById,
  replaceActiveSupportModeFixtureSession,
  shortenActiveSupportModeFixtureSession,
} from "./helpers/e2e-support-mode-fixture";

async function signInAsOwner(page: Page) {
  const { email, password } = requireOwnerCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });
}

async function signInAsHr(page: Page) {
  const { email, password } = requireHrCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });
}

async function startSupportMode(page: Page, scope: "HR" | "Accounts") {
  await page.goto("/admin/support");
  const dialog = await openStartSupportModeDialog(page, scope);
  await dialog.getByLabel("Reason for support access").fill("E2E expiration regression");
  await dialog.getByRole("button", { name: "Start Support Mode" }).click();
  await expect(page.getByText(`Support Mode: ${scope}`)).toBeVisible({
    timeout: 30_000,
  });
}

async function openStartSupportModeDialog(page: Page, scope: "HR" | "Accounts") {
  const trigger = page.getByRole("button", {
    name: new RegExp(`^${scope} Support`),
  });
  const dialog = page.getByRole("dialog", { name: `Start ${scope} Support` });
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

test.describe("Support Mode expiration", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    loadLocalEnvFiles();
  });

  test.beforeEach(() => {
    test.skip(!hasOwnerCredentials(), "Support Mode expiration requires local Owner credentials");
    assertLocalSupportModeFixture();
    closeActiveSupportModeFixtureSession(requireOwnerCredentials().email);
  });

  test.afterEach(() => {
    if (hasOwnerCredentials()) {
      closeActiveSupportModeFixtureSession(requireOwnerCredentials().email);
    }
  });

  test("automatically exits HR Support Mode at the server-provided boundary", async ({ page }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");

    // Exercise real App Router links through the persistent shell before expiry.
    await page
      .locator("aside")
      .getByRole("link", { name: "Deliveries", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/deliveries/);
    await expect(page.getByText("Support Mode: HR")).toBeVisible();
    await page
      .locator("aside")
      .getByRole("link", { name: "Today's Orders", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/todays-orders/);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/deliveries/);
    await page.goForward();
    await expect(page).toHaveURL(/\/admin\/todays-orders/);

    shortenActiveSupportModeFixtureSession(ownerEmail, 8);
    await page.reload();
    await expect(page.getByText("Support Mode: HR")).toBeVisible();

    await expect(page).toHaveURL(/\/admin\/support$/, { timeout: 20_000 });
    await expect(page.getByText("Support Mode: HR")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Support Mode", exact: true, level: 1 }),
    ).toBeVisible();

    const expiredSession = getLatestSupportModeFixtureSession(ownerEmail);
    expect(expiredSession).toMatchObject({
      scope: "hr",
      expired: true,
      endedAt: null,
      endedReason: null,
    });

    // A fresh server request independently enforces expiration.
    await page.goto("/admin/deliveries");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("Support Mode: HR")).toHaveCount(0);
  });

  test("keeps HR Users search and filters read-only in active Owner HR Support Mode", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    await page.goto("/admin/users");

    await expect(page.getByText("Support Mode: HR")).toBeVisible();
    await page.getByLabel("Search").fill("Dev Staff One");
    await page.getByLabel("Status").selectOption("active");
    await page.getByLabel("Role").selectOption("staff");

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(
      page.getByRole("columnheader", { name: "Last Logged In" }),
    ).toBeVisible();
    const staffRow = page.getByRole("row").filter({ hasText: "Dev Staff One" });
    await expect(staffRow).toBeVisible();
    await expect(staffRow.locator("[data-last-sign-in]")).not.toHaveText("Never");
    await expect(staffRow.getByRole("button", { name: "View" })).toBeVisible();
    await staffRow.getByRole("button", { name: "View" }).click();
    const detailsPanel = page.locator("aside").filter({
      has: page.getByRole("heading", { name: "User details" }),
    });
    await expect(detailsPanel).toBeVisible();
    await expect(detailsPanel.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(detailsPanel.getByRole("button", { name: "Deactivate user" })).toHaveCount(0);
  });

  test("renders Last Logged In responsively in governance and HR directories", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsOwner(page);

    await page.goto("/admin/users?context=governance");
    await expect(
      page.getByRole("columnheader", { name: "Last Logged In" }),
    ).toBeVisible();
    const ownerRow = page.getByRole("row").filter({ hasText: "Dev Owner" });
    await expect(ownerRow.locator("[data-last-sign-in]")).not.toHaveText("Never");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(
      page.getByRole("columnheader", { name: "Last Logged In" }),
    ).toBeHidden();
    await expect(ownerRow.getByText(/Last logged in: (?!Never)/)).toBeVisible();

    await startSupportMode(page, "HR");
    await page.goto("/admin/users");
    await page.getByLabel("Search").fill("Dev Staff One");
    const staffRow = page.getByRole("row").filter({ hasText: "Dev Staff One" });
    await expect(staffRow.getByText(/Last logged in: (?!Never)/)).toBeVisible();
    await expect(staffRow.getByRole("button", { name: "View" })).toBeVisible();
  });

  test("denies directory search after HR Support Mode expires", async ({ page }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    await page.goto("/admin/users");
    await expect(page.getByLabel("Search")).toBeVisible();

    expireActiveSupportModeFixtureSession(ownerEmail);
    await page.getByLabel("Search").fill("Dev Staff One");

    await expect(page).toHaveURL(/\/admin\/support$/, { timeout: 20_000 });
    await expect(page.getByTestId("hr-users-table")).toHaveCount(0);
  });

  test("keeps permanent HR directory search and management controls available", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsHr(page);
    await page.goto("/admin/users");

    await page.getByLabel("Search").fill("Dev Staff One");
    await page.getByLabel("Status").selectOption("active");
    await page.getByLabel("Role").selectOption("staff");

    await expect(page).toHaveURL(/\/admin\/users$/);
    const staffRow = page.getByRole("row").filter({ hasText: "Dev Staff One" });
    await expect(staffRow).toBeVisible();
    await expect(staffRow.getByRole("button", { name: "Manage" })).toBeVisible();
  });

  for (const lifecycleEvent of ["focus", "visibilitychange", "pageshow"] as const) {
    test(`reconciles Accounts expiry on ${lifecycleEvent}`, async ({ page }) => {
      test.setTimeout(90_000);
      const ownerEmail = requireOwnerCredentials().email;
      await signInAsOwner(page);
      await startSupportMode(page, "Accounts");
      await page.goto("/admin/lunch-periods");
      await expect(page.getByText("Support Mode: Accounts")).toBeVisible();

      expireActiveSupportModeFixtureSession(ownerEmail);
      if (lifecycleEvent === "visibilitychange") {
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await expect(page).toHaveURL(/\/admin\/lunch-periods$/);
        await expect(page.getByText("Support Mode: Accounts")).toBeVisible();

        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      } else {
        await page.evaluate((eventName) => {
          if (eventName === "pageshow") {
            window.dispatchEvent(
              new PageTransitionEvent(eventName, { persisted: true }),
            );
            return;
          }
          window.dispatchEvent(new Event(eventName));
        }, lifecycleEvent);
      }

      await expect(page).toHaveURL(/\/admin\/support$/, { timeout: 20_000 });
      await expect(page.getByText("Support Mode: Accounts")).toHaveCount(0);
    });
  }

  test("a stale tab cannot terminate a newer Support Mode session", async ({ page }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    await page.goto("/admin/deliveries");
    await expect(page.getByText("Support Mode: HR")).toBeVisible();

    const replacementSessionId = replaceActiveSupportModeFixtureSession(
      ownerEmail,
      "accounts",
    );
    await page.getByRole("button", { name: "Exit Support Mode" }).click();

    await expect(page).toHaveURL(/\/admin\/support\?notice=session-changed$/, {
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "Support Mode changed in another tab. The current session has been preserved.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Support Mode: Accounts")).toBeVisible();
    expect(getLatestSupportModeFixtureSession(ownerEmail)).toMatchObject({
      id: replacementSessionId,
      scope: "accounts",
      expired: false,
      endedAt: null,
      endedReason: null,
    });
  });

  test("a stale Start form cannot replace a newer Support Mode session", async ({ page }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    await page.goto("/admin/support");

    const dialog = await openStartSupportModeDialog(page, "Accounts");
    await dialog.getByLabel("Reason for support access").fill("Stale form attempt");
    const replacementSessionId = replaceActiveSupportModeFixtureSession(
      ownerEmail,
      "accounts",
    );
    await dialog.getByRole("button", { name: "Start Support Mode" }).click();

    await expect(page).toHaveURL(/\/admin\/support\?notice=session-changed$/, {
      timeout: 20_000,
    });
    expect(getLatestSupportModeFixtureSession(ownerEmail)).toMatchObject({
      id: replacementSessionId,
      reason: "E2E stale-tab replacement",
      endedAt: null,
      endedReason: null,
    });
  });

  test("normal Exit records manual audit and intentional Start replacement remains supported", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    const hrSession = getLatestSupportModeFixtureSession(ownerEmail);
    expect(hrSession).not.toBeNull();

    await page.goto("/admin/support");
    const dialog = await openStartSupportModeDialog(page, "Accounts");
    await dialog.getByLabel("Reason for support access").fill("Intentional replacement");
    await dialog.getByRole("button", { name: "Start Support Mode" }).click();
    await expect(page.getByText("Support Mode: Accounts")).toBeVisible({ timeout: 30_000 });
    expect(getSupportModeFixtureSessionById(ownerEmail, hrSession!.id)).toMatchObject({
      endedReason: "replaced",
    });

    const accountsSession = getLatestSupportModeFixtureSession(ownerEmail);
    expect(accountsSession).toMatchObject({
      scope: "accounts",
      reason: "Intentional replacement",
      endedAt: null,
    });
    await page.getByRole("button", { name: "Exit Support Mode" }).click();
    await expect(page).toHaveURL(/\/admin\/support$/, { timeout: 20_000 });
    expect(
      getSupportModeFixtureSessionById(ownerEmail, accountsSession!.id),
    ).toMatchObject({
      endedReason: "manual",
    });
  });

  test("concurrent Start and Exit preserve compare-and-set ordering", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const ownerEmail = requireOwnerCredentials().email;
    await signInAsOwner(page);
    await startSupportMode(page, "HR");
    const originalSession = getLatestSupportModeFixtureSession(ownerEmail);
    expect(originalSession).not.toBeNull();

    await page.goto("/admin/support");
    const secondPage = await context.newPage();
    await secondPage.goto("/admin/support");
    const replacementDialog = await openStartSupportModeDialog(
      secondPage,
      "Accounts",
    );
    await replacementDialog
      .getByLabel("Reason for support access")
      .fill("Concurrent replacement");

    await Promise.all([
      page
        .getByRole("status")
        .filter({ hasText: "Support Mode: HR" })
        .getByRole("button", { name: "Exit Support Mode" })
        .click(),
      replacementDialog.getByRole("button", { name: "Start Support Mode" }).click(),
    ]);

    const latestSession = getLatestSupportModeFixtureSession(ownerEmail);
    expect(latestSession).not.toBeNull();
    if (latestSession!.id === originalSession!.id) {
      expect(latestSession).toMatchObject({ endedReason: "manual" });
    } else {
      expect(latestSession).toMatchObject({
        scope: "accounts",
        reason: "Concurrent replacement",
        endedAt: null,
        endedReason: null,
      });
      expect(
        getSupportModeFixtureSessionById(ownerEmail, originalSession!.id),
      ).toMatchObject({ endedReason: "replaced" });
    }

    await secondPage.close();
  });
});
