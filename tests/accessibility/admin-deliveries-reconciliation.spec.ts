import { test, expect } from "@playwright/test";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  applyAdminDeliveriesRapidReconciliationFixture,
  countDeliveredRapidReconciliationOrders,
  E2E_DELIVERIES_RAPID_ORDER_IDS,
  markRapidReconciliationOrderDeliveredExternally,
  restoreAdminDeliveriesRapidReconciliationFixture,
} from "./helpers/e2e-deliveries-fixture";
import { hasOwnerCredentials, requireHrCredentials, requireOwnerCredentials } from "./helpers/env";
import { STAFF_SEED } from "./helpers/seed-fixtures";

async function signInAsHr(page: import("@playwright/test").Page) {
  const { email, password } = requireHrCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });
}

async function signInAsOwner(page: import("@playwright/test").Page) {
  const { email, password } = requireOwnerCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin\/|home|account)/, { timeout: 30_000 });
}

function rapidOrderIdFromRequest(request: { postData(): string | null }) {
  const body = request.postData() ?? "";
  return E2E_DELIVERIES_RAPID_ORDER_IDS.find((orderId) => body.includes(orderId)) ?? null;
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

  test("four rapid mark-delivered actions persist all deliveries after reload", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsHr(page);

    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );
    const desktopTable = page.locator("table.md\\:min-w-\\[760px\\]");
    const activatedOrderIds: string[] = [];
    const requestedOrderIds: string[] = [];
    const completedRequests: Array<{ orderId: string; status: number }> = [];
    await page.exposeFunction("recordDeliveryActivation", (orderId: string) => {
      activatedOrderIds.push(orderId);
    });
    page.on("request", (request) => {
      const orderId = rapidOrderIdFromRequest(request);
      if (request.method() === "POST" && orderId) {
        requestedOrderIds.push(orderId);
      }
    });
    page.on("response", (response) => {
      const orderId = rapidOrderIdFromRequest(response.request());
      if (response.request().method() === "POST" && orderId) {
        completedRequests.push({ orderId, status: response.status() });
      }
    });
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          const button = target.closest<HTMLButtonElement>("[data-delivery-order-id]");
          if (button?.dataset.deliveryOrderId) {
            void (window as typeof window & { recordDeliveryActivation: (id: string) => Promise<void> })
              .recordDeliveryActivation(button.dataset.deliveryOrderId);
          }
        },
        true,
      );
    });
    await expect(
      desktopTable.getByRole("button", { name: /Mark .* delivered/i }),
    ).toHaveCount(4, { timeout: 15_000 });
    for (const orderId of E2E_DELIVERIES_RAPID_ORDER_IDS) {
      await expect(
        desktopTable.locator(`[data-delivery-order-id="${orderId}"]:visible`),
      ).toBeEnabled();
    }

    await page.evaluate((orderIds) => {
      for (const orderId of orderIds) {
        const button = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            `[data-delivery-order-id="${orderId}"]`,
          ),
        ).find((candidate) => candidate.offsetParent !== null);
        if (!button) {
          throw new Error(`Visible delivery action not found for ${orderId}`);
        }
        button.click();
      }
    }, [...E2E_DELIVERIES_RAPID_ORDER_IDS]);

    await expect.poll(() => activatedOrderIds.length).toBe(4);
    expect(activatedOrderIds).toEqual([...E2E_DELIVERIES_RAPID_ORDER_IDS]);
    await expect.poll(() => requestedOrderIds.length).toBe(4);
    expect(requestedOrderIds).toEqual([...E2E_DELIVERIES_RAPID_ORDER_IDS]);
    await expect.poll(() => completedRequests.length).toBe(4);
    expect(completedRequests).toEqual(
      E2E_DELIVERIES_RAPID_ORDER_IDS.map((orderId) => ({ orderId, status: 200 })),
    );
    await expect(
      page
        .getByRole("region", { name: "Recent delivery updates" })
        .getByRole("listitem"),
    ).toHaveCount(4);
    expect(countDeliveredRapidReconciliationOrders()).toBe(4);

    await page.reload();
    await expect(
      desktopTable.getByRole("button", { name: /Mark .* delivered/i }),
    ).toHaveCount(0);

    expect(countDeliveredRapidReconciliationOrders()).toBe(4);
  });

  test("undo-delivery dismissal restores focus without changing the order", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsHr(page);
    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );
    const deliveriesTable = page.locator("table.md\\:min-w-\\[760px\\]");
    const orderId = E2E_DELIVERIES_RAPID_ORDER_IDS[0];
    const markDeliveredButton = deliveriesTable.locator(
      `[data-delivery-order-id="${orderId}"]:visible`,
    );
    await expect(markDeliveredButton).toBeEnabled();
    await markDeliveredButton.click();
    await expect(
      page
        .getByRole("region", { name: "Recent delivery updates" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    expect(countDeliveredRapidReconciliationOrders()).toBe(1);

    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=delivered`,
    );
    const undoDeliveryButton = page
      .locator(`[data-delivery-order-id="${orderId}"]:visible`)
      .first();
    const dialog = page.getByRole("dialog", { name: /Undo delivery/i });

    await expect(undoDeliveryButton).toBeEnabled();
    await undoDeliveryButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(undoDeliveryButton).toBeFocused();
    expect(countDeliveredRapidReconciliationOrders()).toBe(1);

    await undoDeliveryButton.click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Undo delivery for/i }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(undoDeliveryButton).toBeFocused();
    expect(countDeliveredRapidReconciliationOrders()).toBe(1);

    await undoDeliveryButton.click();
    await expect(dialog).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel undo delivery" })
      .click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeHidden();
    await expect(undoDeliveryButton).toBeFocused();
    expect(countDeliveredRapidReconciliationOrders()).toBe(1);

    await undoDeliveryButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Undo delivery", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Recent delivery updates" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    expect(countDeliveredRapidReconciliationOrders()).toBe(0);
    await expect(page.locator("[data-delivery-filter]").first()).toBeFocused();
  });

  test("mobile delivery actions are visible without table overflow", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await signInAsHr(page);
    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );

    const markDeliveredButtons = page.getByRole("button", {
      name: /Mark .* delivered/i,
    });
    await expect(markDeliveredButtons).toHaveCount(4, { timeout: 15_000 });
    await expect(markDeliveredButtons.first()).toBeVisible();
    await expect(markDeliveredButtons.first()).toBeEnabled();
    const deliveriesTable = markDeliveredButtons.first().locator("xpath=ancestor::table");
    await expect(deliveriesTable).toHaveCount(1);

    await expect
      .poll(() =>
        deliveriesTable.evaluate((table) => table.scrollWidth <= table.clientWidth),
      )
      .toBe(true);
  });

  test("all six filters keep their selection and counts after a confirmed delivery", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsHr(page);
    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );
    const table = page.locator("table.md\\:min-w-\\[760px\\]");
    const firstOrderId = E2E_DELIVERIES_RAPID_ORDER_IDS[0];
    await table.locator(`[data-delivery-order-id="${firstOrderId}"]:visible`).click();
    await expect(
      page.getByRole("region", { name: "Recent delivery updates" }).getByRole("listitem"),
    ).toHaveCount(1);

    const filters = [
      ["All", "all"],
      ["Pending", "pending"],
      ["Delivered", "delivered"],
      ["Issues", "issues"],
      ["Resolved", "resolved"],
      ["Cancelled", "cancelled"],
    ] as const;
    for (const [label, status] of filters) {
      const filter = page.getByRole("button", { name: new RegExp(`^${label} `) });
      await filter.focus();
      await page.keyboard.press("Enter");
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      if (status === "pending") {
        await expect(page).not.toHaveURL(/status=/);
      } else {
        await expect(page).toHaveURL(new RegExp(`status=${status}`));
      }
      await expect(page.getByRole("button", { name: /^All 4$/ })).toBeVisible();
    }

    const deliveredFilter = page.getByRole("button", { name: /^Delivered 1$/ });
    await deliveredFilter.click();
    await expect(deliveredFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Undo delivery for/i })).toHaveCount(1);
  });

  test("stale delivery state refreshes without a duplicate mutation", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsHr(page);
    await page.goto(
      `/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`,
    );
    const orderId = E2E_DELIVERIES_RAPID_ORDER_IDS[0];
    const markDelivered = page.locator(`[data-delivery-order-id="${orderId}"]:visible`);
    await expect(markDelivered).toBeEnabled();

    markRapidReconciliationOrderDeliveredExternally(orderId);
    const mutationRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && rapidOrderIdFromRequest(request) === orderId) {
        mutationRequests.push(request.url());
      }
    });
    await markDelivered.click();

    await expect(
      page.locator("p.text-sm.text-muted").filter({
        hasText: /changed by another authorized HR user.*Latest delivery data/i,
      }),
    ).toBeVisible();
    expect(mutationRequests).toHaveLength(1);
    await expect(page.getByRole("button", { name: /^Pending 3$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Delivered 1$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pending 3$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(markDelivered).toHaveCount(0);

    const deliveredFilter = page.getByRole("button", { name: /^Delivered 1$/ });
    await deliveredFilter.focus();
    await page.keyboard.press("Enter");
    await expect(deliveredFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`[data-delivery-order-id="${orderId}"]:visible`)).toHaveText("Undo delivery");
    expect(countDeliveredRapidReconciliationOrders()).toBe(1);
  });

  test("Owner Support Mode can view deliveries but cannot reconcile them", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!hasOwnerCredentials(), "Owner Support Mode check requires a local Owner or shared staff password");
    await signInAsOwner(page);
    await page.goto("/admin/support", { waitUntil: "networkidle" });
    const exitSupport = page.getByRole("button", { name: "Exit Support Mode" }).first();
    if (await exitSupport.isVisible()) {
      await exitSupport.click();
      await expect(exitSupport).toBeHidden();
    }

    await page.getByRole("button", { name: /^HR Support\b/i }).click();
    await page.getByLabel("Reason for support access").fill("E2E deliveries read-only check");
    await page.getByRole("dialog").getByRole("button", { name: "Start Support Mode" }).click();
    await expect(page.getByText("Support Mode: HR")).toBeVisible({ timeout: 30_000 });
    await page.goto(`/admin/deliveries?provider=${STAFF_SEED.providerAlberries}&status=pending`);
    await expect(page.getByText("Changes are unavailable in Support Mode.")).toBeVisible();
    await expect(page.locator("[data-delivery-action]")).toHaveCount(0);

    await page.goto("/admin/support", { waitUntil: "networkidle" });
    const exitAfterTest = page.getByRole("button", { name: "Exit Support Mode" }).first();
    if (await exitAfterTest.isVisible()) {
      await exitAfterTest.click();
      await expect(exitAfterTest).toBeHidden();
    }
  });
});
