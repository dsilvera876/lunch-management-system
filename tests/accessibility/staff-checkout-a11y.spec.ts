import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import { runLocalDbQuery } from "./helpers/e2e-local-db";
import {
  E2E_STAFF1_PROFILE_ID,
  isLocalSupabaseApiUrl,
  loadLocalEnvFiles,
} from "./helpers/e2e-ordering-fixture";
import { requireStaffCredentials } from "./helpers/env";
import { expectNoAxeViolations } from "./helpers/axe";
import { expectNoUnintendedHorizontalPageScroll } from "./helpers/layout";
import { STAFF_SEED } from "./helpers/seed-fixtures";
import { applySimulatedJamaicaToday } from "./helpers/simulated-weekday";
import { expectProviderOrderingReady } from "./helpers/staff-page";

/**
 * PRL-004 to PRL-007 regression: focus, announcements, blocked checkout,
 * persistent success, and explicit delivery-location confirmation.
 * Requires open ordering: a weekday with the standard fixture, or a weekend
 * with the simulated-weekday server (tests/accessibility/README.md).
 */

const NO_DEFAULT_STAFF_EMAIL = process.env.E2E_NO_DEFAULT_STAFF_EMAIL?.trim() || "staff3@lunch.test";
const NO_DEFAULT_STAFF_PROFILE_ID = "10000006-0006-4006-8006-000000000006";

const lunchUrl = `/lunch?provider=${STAFF_SEED.providerAlberries}`;
/** Seed provider display name ("Alberries Caterors"). */
const PROVIDER = "Alberries[^.]*?";
const BBQ_CHICKEN_MENU_ITEM_ID = "31000001-0001-4001-8001-000000000001";

function cartPanel(page: Page) {
  return page.locator("form").filter({ has: page.getByRole("heading", { name: "Lunch Cart" }) });
}

async function checkoutErrorSummary(page: Page) {
  const placeOrder = page.getByRole("button", { name: "Place Order" });
  await expect(placeOrder).toHaveAttribute("aria-describedby", /\S/);
  const summaryId = await placeOrder.getAttribute("aria-describedby");
  if (!summaryId) {
    throw new Error("Place Order is not associated with checkout feedback.");
  }
  return page.locator(`[id=${JSON.stringify(summaryId)}]`);
}

function cartAnnouncer(page: Page) {
  return page.locator("[data-cart-announcer]");
}

function addButton(page: Page, itemName: string) {
  return page.getByRole("button", { name: new RegExp(`^Add ${itemName}`) });
}

function addedButton(page: Page, itemName: string) {
  return page.getByRole("button", { name: new RegExp(`^${itemName}.*added to your order$`) });
}

async function openLunch(page: Page, options?: { confirmHydration?: boolean }) {
  await page.goto(lunchUrl);
  await expectProviderOrderingReady(page);
  if (options?.confirmHydration !== false) {
    await confirmLunchWorkspaceHydrated(page);
  }
}

async function confirmLunchWorkspaceHydrated(page: Page) {
  const initialProvider = page.getByRole("tab", { name: /Alberries/ });
  const alternateProvider = page.getByRole("tab", { name: /Davis Catering/ });
  for (const provider of [alternateProvider, initialProvider]) {
    await expect
      .poll(
        async () => {
          await provider.click();
          return provider.getAttribute("aria-selected");
        },
        { message: "Lunch ordering controls should be hydrated" },
      )
      .toBe("true");
  }
}

async function pressOn(page: Page, locator: ReturnType<Page["locator"]>, key = "Enter") {
  await locator.focus();
  await page.keyboard.press(key);
}

async function buildCompletedOrder(page: Page, mainItem = "Fried Chicken") {
  await pressOn(page, addButton(page, mainItem));
  await pressOn(page, addButton(page, "Plain Rice"));
  await pressOn(page, page.getByRole("button", { name: "Finish This Order" }));
  await expect(page.locator("[data-cart-entry-heading]").first()).toBeVisible();
}

function requireLocalDb() {
  loadLocalEnvFiles();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!isLocalSupabaseApiUrl(url)) {
    throw new Error("[checkout a11y] Refusing DB cleanup — Supabase URL is not loopback.");
  }
}

function readDefaultLocation(profileId: string): string | null {
  requireLocalDb();
  const row = runLocalDbQuery(
    `select default_office_location_id::text as id from public.profiles where id = '${profileId}'::uuid`,
  )[0];
  return row?.id ? String(row.id) : null;
}

function setProviderMenuItemActive(itemId: string, active: boolean) {
  requireLocalDb();
  const rows = runLocalDbQuery(`
    update public.provider_menu_items
    set active = ${active ? "true" : "false"}
    where id = '${itemId}'::uuid
    returning id, active
  `);
  expect(rows).toHaveLength(1);
}

function readProviderMenuItemActive(itemId: string): boolean {
  requireLocalDb();
  const row = runLocalDbQuery(`
    select active
    from public.provider_menu_items
    where id = '${itemId}'::uuid
  `)[0];
  if (!row) {
    throw new Error(`[checkout a11y] Menu item ${itemId} was not found.`);
  }
  return row.active === true || row.active === "t";
}

function readOrderCutoffTime(): string {
  requireLocalDb();
  const value = runLocalDbQuery(
    "select order_cutoff_time::text as cutoff from public.app_settings where id = 1",
  )[0]?.cutoff;
  if (typeof value !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error("[checkout a11y] Could not read the local ordering cutoff.");
  }
  return value;
}

function setOrderCutoffTime(cutoff: string) {
  requireLocalDb();
  if (!/^\d{2}:\d{2}:\d{2}$/.test(cutoff)) {
    throw new Error("[checkout a11y] Refusing an invalid ordering cutoff value.");
  }
  const rows = runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = '${cutoff}'::time
    where id = 1
    returning order_cutoff_time::text as cutoff
  `);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.cutoff).toBe(cutoff);
}

async function signInAs(browser: Browser, email: string): Promise<Page> {
  const { password } = requireStaffCredentials();
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await applySimulatedJamaicaToday(context);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|lunch|my-orders|account)/, { timeout: 30_000 });
  return page;
}

test.describe("Staff checkout accessibility (PRL-004 to PRL-007)", () => {
  test.use({ actionTimeout: 15_000 });

  test.beforeEach(async ({ context }) => {
    await applySimulatedJamaicaToday(context);
  });

  test("Add keeps focus on the toggle and reports the added state", async ({ page }) => {
    await openLunch(page);
    await pressOn(page, addButton(page, "BBQ Chicken"));

    const added = addedButton(page, "BBQ Chicken");
    await expect(added).toBeFocused();
    await expect(added).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(added).toBeFocused();

    await pressOn(page, addButton(page, "Plain Rice"));
    await expect(addedButton(page, "Plain Rice")).toBeFocused();
  });

  test("meal quantity buttons keep focus at the minimum and announce the value", async ({ page }) => {
    await openLunch(page);
    await pressOn(page, addButton(page, "BBQ Chicken"));
    await pressOn(page, addButton(page, "Plain Rice"));

    const decrease = page.getByRole("button", {
      name: new RegExp(`Decrease quantity for ${PROVIDER} meal quantity`),
    });
    const increase = page.getByRole("button", {
      name: new RegExp(`Increase quantity for ${PROVIDER} meal quantity`),
    });
    const live = page.locator('[aria-live="polite"]', { hasText: /^Quantity \d+$/ }).first();

    await expect(decrease).toHaveAttribute("aria-disabled", "true");
    await pressOn(page, increase);
    await expect(increase).toBeFocused();
    await expect(live).toHaveText("Quantity 2");

    await pressOn(page, decrease);
    await expect(decrease).toBeFocused();
    await expect(live).toHaveText("Quantity 1");
    await expect(decrease).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.press("Enter");
    await expect(decrease).toBeFocused();
    await expect(live).toHaveText("Quantity 1");
  });

  test("Finish This Order moves focus to the completed cart entry", async ({ page }) => {
    await openLunch(page);
    await buildCompletedOrder(page);

    const entryHeading = page.locator("[data-cart-entry-heading]").last();
    await expect(entryHeading).toBeFocused();
    await expect(entryHeading).toContainText(/Completed/i);
    await expect(entryHeading).toContainText(new RegExp(`${PROVIDER} — Order \\d+`));
  });

  test("Remove keeps focus in the cart and announces once", async ({ page }) => {
    await openLunch(page);
    await pressOn(page, addButton(page, "BBQ Chicken"));
    await pressOn(page, addButton(page, "Plain Rice"));
    await pressOn(page, addButton(page, "Rice and Peas"));

    const cart = cartPanel(page);
    const removeButtons = cart.getByRole("button", {
      name: new RegExp(`^Remove .+ from ${PROVIDER} order$`),
    });
    await expect(removeButtons).toHaveCount(3);

    await pressOn(page, removeButtons.nth(1));
    await expect(removeButtons).toHaveCount(2);
    await expect(removeButtons.nth(1)).toBeFocused();
    await expect(cartAnnouncer(page)).toHaveText(
      new RegExp(`^Plain Rice removed from your ${PROVIDER} order\\.\\s*$`),
    );
    await expect(page.locator("[data-cart-announcer]")).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(removeButtons).toHaveCount(1);
    await expect(removeButtons.first()).toBeFocused();
    await expect(cartAnnouncer(page)).toHaveText(
      new RegExp(`^Rice and Peas removed from your ${PROVIDER} order\\.\\s*$`),
    );

    await page.keyboard.press("Enter");
    await expect(removeButtons).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Lunch Cart" })).toBeFocused();
    await expect(cartAnnouncer(page)).toHaveText(
      new RegExp(`^BBQ Chicken removed from your ${PROVIDER} order\\.\\s*$`),
    );
  });

  test("removing a completed order and Clear All move focus to stable targets", async ({ page }) => {
    await openLunch(page);
    await buildCompletedOrder(page);
    await buildCompletedOrder(page);

    const trash = page.getByRole("button", {
      name: new RegExp(`^Remove ${PROVIDER} order \\d+ from lunch cart$`),
    });
    await expect(trash).toHaveCount(2);
    await pressOn(page, trash.last());
    await expect(trash).toHaveCount(1);
    await expect(trash.first()).toBeFocused();
    await expect(cartAnnouncer(page)).toHaveText(
      new RegExp(`^${PROVIDER} order \\d+ removed from your lunch cart\\.\\s*$`),
    );

    await pressOn(page, page.getByRole("button", { name: "Clear All" }));
    await expect(page.getByRole("heading", { name: "Lunch Cart" })).toBeFocused();
    await expect(cartAnnouncer(page)).toHaveText(
      /^All completed orders were removed from your lunch cart\.\s*$/,
    );
  });

  test("blocked Place Order explains what to correct and re-focuses on repeat", async ({ page }) => {
    await openLunch(page);
    const cart = cartPanel(page);
    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await expect(placeOrder).toHaveAttribute("aria-disabled", "true");
    await expect(
      cart.getByText("Complete your lunch cart before placing your order.", { exact: true }),
    ).toHaveCount(1);

    await pressOn(page, placeOrder);
    const summary = await checkoutErrorSummary(page);
    await expect(summary).toBeFocused();
    await expect(summary).toHaveText(/\S/);
    await expect(summary).not.toHaveAttribute("role", /alert|status/);
    await expect(summary).not.toHaveAttribute("aria-live", /.+/);
    await expect(
      cart.getByText("Complete your lunch cart before placing your order.", { exact: true }),
    ).toHaveCount(1);
    await expect(page.locator("form > [tabindex='-1']")).toHaveCount(0);
    const summaryId = await summary.getAttribute("id");
    expect(summaryId).not.toBeNull();
    await expect(placeOrder).toHaveAttribute("aria-describedby", summaryId!);
    expect(
      await summary.evaluate((node) => {
        const button = node.parentElement?.querySelector("button[type='submit']");
        return Boolean(
          button && node.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    await expect(page).toHaveURL(/\/lunch/);

    await pressOn(page, addButton(page, "BBQ Chicken"));
    await expect(summary).toHaveCount(0);
    await pressOn(page, placeOrder, "Space");
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(/Alberries/);

    await placeOrder.focus();
    await page.keyboard.press("Enter");
    await expect(summary).toBeFocused();
  });

  test("cart changes clear stale checkout errors", async ({ page }) => {
    await openLunch(page);
    await buildCompletedOrder(page);
    await pressOn(page, addButton(page, "BBQ Chicken"));

    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await pressOn(page, placeOrder);
    const summary = await checkoutErrorSummary(page);
    await expect(summary).toBeFocused();

    await pressOn(
      page,
      page.getByRole("button", {
        name: new RegExp(`^Remove ${PROVIDER} order \\d+ from lunch cart$`),
      }),
    );
    await expect(summary).toHaveCount(0);
    await expect(placeOrder).toHaveAttribute("aria-describedby");
    await expect(
      cartPanel(page).getByText(
        "Finish the in-progress order for Alberries Caterors before placing your checkout.",
        { exact: true },
      ),
    ).toHaveCount(1);
  });

  test("authoritative checkout failures appear once beside Place Order", async ({ page }) => {
    await openLunch(page);
    await buildCompletedOrder(page, "BBQ Chicken");

    const originalActive = readProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID);
    try {
      setProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID, false);
      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await pressOn(page, placeOrder);

      const summary = await checkoutErrorSummary(page);
      await expect(summary).toBeFocused({ timeout: 30_000 });
      await expect(summary).toContainText(/Alberries.*no longer available.*Refresh the page/i);
      await expect(
        cartPanel(page).getByText(/Alberries.*no longer available.*Refresh the page/i),
      ).toHaveCount(1);
      const summaryId = await summary.getAttribute("id");
      expect(summaryId).not.toBeNull();
      await expect(placeOrder).toHaveAttribute("aria-describedby", summaryId!);

      await pressOn(page, addButton(page, "BBQ Chicken"));
      await expect(summary).toContainText(/Alberries.*no longer available.*Refresh the page/i);

      await page.setViewportSize({ width: 375, height: 667 });
      await summary.scrollIntoViewIfNeeded();
      await expect(summary).toBeInViewport();
      await expect(placeOrder).toBeInViewport();
      await expectNoUnintendedHorizontalPageScroll(page);

      await pressOn(
        page,
        page.getByRole("button", {
          name: new RegExp(`^Remove ${PROVIDER} order \\d+ from lunch cart$`),
        }),
      );
      await expect(summary).toHaveCount(0);
    } finally {
      setProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID, originalActive);
    }
  });

  test("an in-flight checkout freezes its cart and delivery-location snapshot", async ({
    page,
  }) => {
    await openLunch(page);
    await buildCompletedOrder(page, "BBQ Chicken");

    const originalActive = readProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID);
    let releaseRequest: () => void = () => {};
    const requestMayContinue = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    let markActionStarted: () => void = () => {};
    const actionStarted = new Promise<void>((resolve) => {
      markActionStarted = resolve;
    });
    const lunchActionUrl = /\/lunch(?:\?.*)?$/;
    const holdCheckoutAction = async (route: Route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        markActionStarted();
        await requestMayContinue;
      }
      await route.continue();
    };
    await page.route(lunchActionUrl, holdCheckoutAction);

    try {
      const placeOrder = cartPanel(page).locator('button[type="submit"]');
      await expect(placeOrder).toHaveText("Place Order");
      const clearAll = page.getByRole("button", { name: "Clear All" });
      const removeOrder = page.getByRole("button", {
        name: new RegExp(`^Remove ${PROVIDER} order \\d+ from lunch cart$`),
      });
      const addAnotherItem = addButton(page, "Fried Chicken");
      const locationTrigger = page
        .getByRole("button", { name: /Change delivery location|Choose delivery location/ })
        .first();
      const deliverTo = page.locator("p", { has: locationTrigger });
      const initialLocationText = await deliverTo.textContent();

      await pressOn(page, placeOrder);
      await actionStarted;
      setProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID, false);

      await expect(placeOrder).toHaveAttribute("aria-busy", "true");
      await expect(placeOrder).toHaveAttribute("aria-disabled", "true");
      await expect(clearAll).toBeDisabled();
      await expect(removeOrder).toBeDisabled();
      await expect(addAnotherItem).toBeDisabled();
      await expect(locationTrigger).toBeDisabled();

      // dispatchEvent bypasses Playwright's disabled-control actionability check;
      // handler guards must still preserve the snapshot against queued/programmatic events.
      await addAnotherItem.dispatchEvent("click");
      await removeOrder.dispatchEvent("click");
      await clearAll.dispatchEvent("click");
      await locationTrigger.dispatchEvent("click");

      await expect(page.locator("[data-cart-entry-heading]")).toHaveCount(1);
      await expect(addButton(page, "Fried Chicken")).toBeVisible();
      await expect(deliverTo).toHaveText(initialLocationText ?? "");
      await expect(page.getByRole("dialog", { name: "Delivery location" })).toHaveCount(0);

      releaseRequest();
      const summary = await checkoutErrorSummary(page);
      await expect(summary).toBeFocused({ timeout: 30_000 });
      await expect(summary).toContainText(/Alberries.*no longer available.*Refresh the page/i);
      await expect(clearAll).toBeEnabled();
      await expect(removeOrder).toBeEnabled();
      await expect(addAnotherItem).toBeEnabled();
      await expect(locationTrigger).toBeEnabled();
    } finally {
      releaseRequest();
      await page.unroute(lunchActionUrl, holdCheckoutAction);
      setProviderMenuItemActive(BBQ_CHICKEN_MENU_ITEM_ID, originalActive);
    }
  });

  test("ordering-closed server errors survive unrelated cart changes", async ({ page }) => {
    await openLunch(page);
    await buildCompletedOrder(page, "Fried Chicken");

    const originalCutoff = readOrderCutoffTime();
    try {
      setOrderCutoffTime("00:00:00");
      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await pressOn(page, placeOrder);

      const summary = await checkoutErrorSummary(page);
      await expect(summary).toBeFocused({ timeout: 30_000 });
      await expect(summary).toHaveText("Ordering is not available right now.");

      await pressOn(page, addButton(page, "Fried Chicken"));
      await expect(summary).toHaveText("Ordering is not available right now.");

      await pressOn(
        page,
        page.getByRole("button", {
          name: new RegExp(`^Remove ${PROVIDER} order \\d+ from lunch cart$`),
        }),
      );
      await expect(summary).toHaveText("Ordering is not available right now.");
      const summaryId = await summary.getAttribute("id");
      expect(summaryId).not.toBeNull();
      await expect(placeOrder).toHaveAttribute("aria-describedby", summaryId!);
    } finally {
      setOrderCutoffTime(originalCutoff);
    }
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
  ]) {
    test(`${viewport.width}px checkout feedback stays with Place Order without page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openLunch(page);
      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await placeOrder.scrollIntoViewIfNeeded();
      await pressOn(page, placeOrder, "Space");

      const summary = await checkoutErrorSummary(page);
      await expect(summary).toBeFocused();
      await expect(summary).toBeInViewport();
      await expect(placeOrder).toBeInViewport();
      await expectNoUnintendedHorizontalPageScroll(page);
    });
  }

  test("location select does not commit on arrow keys; confirmation applies it", async ({ page }) => {
    await openLunch(page);
    const trigger = page
      .getByRole("button", { name: /Change delivery location|Choose delivery location/ })
      .first();
    const deliverTo = page.locator("p", { has: trigger });
    const initialText = (await deliverTo.textContent()) ?? "";

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Delivery location" });
    const select = dialog.getByLabel("Choose delivery location");
    await expect(select).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(dialog).toBeVisible();
    await expect(deliverTo).toHaveText(initialText);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(deliverTo).toHaveText(initialText);

    await trigger.click();
    await expect(select).toBeFocused();
    const current = await select.inputValue();
    const values = await select.locator("option:not([disabled])").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
    const nextIndex = values.findIndex((value) => value !== current);
    expect(nextIndex).toBeGreaterThanOrEqual(0);
    await select.selectOption(values[nextIndex]);
    await expect(dialog).toBeVisible();
    await expectNoAxeViolations(page, "Delivery location dialog");

    await dialog.getByRole("button", { name: "Use this location" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(deliverTo).not.toHaveText(initialText);
  });

  test("missing location opens the picker with an explanation and returns focus to Place Order", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const defaultBefore = readDefaultLocation(NO_DEFAULT_STAFF_PROFILE_ID);
    test.skip(defaultBefore !== null, "Seed user without a default location is required");

    const page = await signInAs(browser, NO_DEFAULT_STAFF_EMAIL);
    try {
      await openLunch(page, { confirmHydration: false });
      const dialog = page.getByRole("dialog", { name: "Delivery location" });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await confirmLunchWorkspaceHydrated(page);

      await buildCompletedOrder(page);
      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await pressOn(page, placeOrder);
      const locationError = await checkoutErrorSummary(page);

      await expect(dialog).toBeVisible();
      await expect(dialog).toBeInViewport();
      await expect(dialog).toHaveAccessibleDescription(
        "Choose a delivery location before placing your order.",
      );
      const select = dialog.getByLabel("Choose delivery location");
      await expect(select).toBeFocused();

      await dialog.getByRole("button", { name: "Use this location" }).click();
      await expect(dialog.getByText(/Select a delivery location, then choose Use this location\./)).toBeVisible();
      await expect(select).toBeFocused();
      await expect(select).toHaveAttribute("aria-invalid", "true");

      const firstValue = await select
        .locator("option:not([disabled])")
        .first()
        .evaluate((node) => (node as HTMLOptionElement).value);
      await select.selectOption(firstValue);
      const saveDefault = dialog.getByLabel("Save as my default delivery location");
      await saveDefault.uncheck();
      await dialog.getByRole("button", { name: "Use this location" }).click();

      await expect(dialog).toBeHidden();
      await expect(placeOrder).toBeFocused();
      await expect(placeOrder).toBeInViewport();
      await expect(placeOrder).not.toHaveAttribute("aria-disabled", "true");
      await expect(locationError).toHaveCount(0);
    } finally {
      await page.context().close();
      expect(readDefaultLocation(NO_DEFAULT_STAFF_PROFILE_ID)).toBeNull();
    }
  });

  test.describe("successful checkout", () => {
    let checkoutStartedAt: string | null = null;

    test.afterEach(() => {
      if (!checkoutStartedAt) {
        return;
      }
      requireLocalDb();
      const deleted = runLocalDbQuery(`
        delete from public.orders
        where profile_id = '${E2E_STAFF1_PROFILE_ID}'::uuid
          and created_at >= '${checkoutStartedAt}'::timestamptz
        returning id
      `);
      checkoutStartedAt = null;
      expect(deleted.length, "checkout test should clean up the order it placed").toBeGreaterThan(0);
    });

    test("success confirmation persists, takes focus, and links to My Orders", async ({ page }) => {
      await openLunch(page);
      await buildCompletedOrder(page);

      requireLocalDb();
      checkoutStartedAt = String(runLocalDbQuery("select now()::text as t")[0]?.t);

      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await pressOn(page, placeOrder);

      const success = page.getByRole("heading", { name: "Lunch order placed successfully" });
      await expect(success).toBeFocused({ timeout: 30_000 });
      const region = page.getByRole("region", { name: "Lunch order placed successfully" });
      await expect(region).toContainText(/1 lunch order from 1 provider/);
      await expect(region).not.toHaveAttribute("role", /alert|status/);
      const myOrders = region.getByRole("link", { name: "View My Orders" });
      await expect(myOrders).toHaveAttribute(
        "href",
        /^\/my-orders\?checkout=[0-9a-f-]{36}$/,
      );
      const href = await myOrders.getAttribute("href");
      const orderGroupId = new URL(href!, "http://localhost").searchParams.get("checkout");
      expect(orderGroupId).toMatch(/^[0-9a-f-]{36}$/);

      await page.waitForTimeout(8_000);
      await expect(region).toBeVisible();
      await expectNoAxeViolations(page, "Checkout success confirmation");

      await myOrders.click();
      await expect(page).toHaveURL(/\/my-orders$/);
      const placedCheckout = page.locator(
        `[data-testid="checkout-subgroup"][data-checkout-id="${orderGroupId}"]`,
      );
      await expect(placedCheckout).toBeInViewport();
      await expect(
        placedCheckout.getByTestId("provider-order-card").first(),
      ).toHaveAttribute("data-new-order-highlight", "true");
      await expect(page.getByRole("status")).toContainText(
        "Your newly placed order is shown below.",
      );
      await expect(
        placedCheckout.getByTestId("provider-order-card").first(),
      ).not.toHaveAttribute("data-new-order-highlight", "true", { timeout: 5_000 });
    });
  });
});
