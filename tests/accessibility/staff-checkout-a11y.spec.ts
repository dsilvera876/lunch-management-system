import { expect, test, type Browser, type Page } from "@playwright/test";
import { runLocalDbQuery } from "./helpers/e2e-local-db";
import {
  E2E_STAFF1_PROFILE_ID,
  isLocalSupabaseApiUrl,
  loadLocalEnvFiles,
} from "./helpers/e2e-ordering-fixture";
import { requireStaffCredentials } from "./helpers/env";
import { expectNoAxeViolations } from "./helpers/axe";
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

function cartPanel(page: Page) {
  return page.locator("form").filter({ has: page.getByRole("heading", { name: "Lunch Cart" }) });
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

async function openLunch(page: Page) {
  await page.goto(lunchUrl);
  await expectProviderOrderingReady(page);
}

async function pressOn(page: Page, locator: ReturnType<Page["locator"]>, key = "Enter") {
  await locator.focus();
  await page.keyboard.press(key);
}

async function buildCompletedOrder(page: Page) {
  await pressOn(page, addButton(page, "BBQ Chicken"));
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
    const removeButtons = cart.getByRole("button", { name: "Remove", exact: true });
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

    const trash = page.getByRole("button", { name: /^Remove order \d+ from lunch cart$/ });
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
    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await expect(placeOrder).toHaveAttribute("aria-disabled", "true");

    const summary = page.locator("form > [tabindex='-1']");

    await pressOn(page, placeOrder);
    await expect(summary).toBeFocused();
    await expect(summary).toHaveText(/\S/);
    await expect(summary).not.toHaveAttribute("role", /alert|status/);
    await expect(summary).not.toHaveAttribute("aria-live", /.+/);
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

  test("location select does not commit on arrow keys; confirmation applies it", async ({ page }) => {
    await openLunch(page);
    const trigger = page.getByRole("button", { name: /· Change|· Choose/ }).first();
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
      await openLunch(page);
      const dialog = page.getByRole("dialog", { name: "Delivery location" });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await buildCompletedOrder(page);
      const placeOrder = page.getByRole("button", { name: "Place Order" });
      await pressOn(page, placeOrder);

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
      await expect(myOrders).toHaveAttribute("href", "/my-orders");

      await page.waitForTimeout(8_000);
      await expect(region).toBeVisible();
      await expectNoAxeViolations(page, "Checkout success confirmation");

      await myOrders.click();
      await expect(page).toHaveURL(/\/my-orders/);
    });
  });
});
