import { test, expect } from "@playwright/test";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  applyAdminDeliveriesRapidReconciliationFixture,
  countDeliveredRapidReconciliationOrders,
  restoreAdminDeliveriesRapidReconciliationFixture,
} from "./helpers/e2e-deliveries-fixture";
import { requireHrCredentials } from "./helpers/env";
import { STAFF_SEED } from "./helpers/seed-fixtures";

async function signInAsHr(page: import("@playwright/test").Page) {
  const { email, password } = requireHrCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });
}

test.describe("Admin deliveries — rapid reconciliation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    loadLocalEnvFiles();
  });

  test.beforeEach(() => {
    applyAdminDeliveriesRapidReconciliationFixture();
  });

  test.afterAll(() => {
    restoreAdminDeliveriesRapidReconciliationFixture();
  });

  test("rapid pending checkboxes persist all deliveries after reload", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsHr(page);

    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );

    const desktopTable = page.locator("table.min-w-\\[760px\\]");
    await expect(
      desktopTable.getByRole("checkbox", { name: /Mark .* delivered/i }),
    ).toHaveCount(4, { timeout: 15_000 });

    const pendingCheckboxes = () =>
      desktopTable.getByRole("checkbox", { name: /Mark .* delivered/i });

    await Promise.all((await pendingCheckboxes().all()).map((box) => box.click()));

    await expect
      .poll(
        async () => {
          const delivered = countDeliveredRapidReconciliationOrders();
          if (delivered < 4) {
            const remaining = await pendingCheckboxes().all();
            if (remaining.length > 0) {
              await Promise.all(remaining.map((box) => box.click()));
            }
          }

          return delivered;
        },
        { timeout: 90_000 },
      )
      .toBe(4);

    await page.reload();
    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );
    await expect(
      desktopTable.getByRole("checkbox", { name: /Mark .* delivered/i }),
    ).toHaveCount(0);

    expect(countDeliveredRapidReconciliationOrders()).toBe(4);
  });
});
