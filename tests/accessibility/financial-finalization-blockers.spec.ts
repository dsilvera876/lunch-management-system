import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  formatAxeViolations,
  STAFF_AXE_WCAG_TAGS,
} from "./helpers/axe";
import { runLocalDbExec } from "./helpers/e2e-local-db";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  requireHrCredentials,
  requireOwnerCredentials,
  requireStaffCredentials,
} from "./helpers/env";

const FIXTURE = {
  periodId: "87100000-0000-4000-8000-000000000001",
  providerAId: "87200000-0000-4000-8000-000000000001",
  providerBId: "87200000-0000-4000-8000-000000000002",
  lunchDayAId: "87300000-0000-4000-8000-000000000001",
  lunchDayBId: "87300000-0000-4000-8000-000000000002",
  menuItemAId: "87400000-0000-4000-8000-000000000001",
  menuItemBId: "87400000-0000-4000-8000-000000000002",
  orderAId: "87500000-0000-4000-8000-000000000001",
  orderBId: "87500000-0000-4000-8000-000000000002",
} as const;

function restoreFixture() {
  runLocalDbExec(`
    do $fixture_cleanup$
    begin
    delete from public.orders
    where id in (
      '${FIXTURE.orderAId}'::uuid,
      '${FIXTURE.orderBId}'::uuid
    );

    delete from public.menu_items
    where id in (
      '${FIXTURE.menuItemAId}'::uuid,
      '${FIXTURE.menuItemBId}'::uuid
    );

    delete from public.lunch_days
    where id in (
      '${FIXTURE.lunchDayAId}'::uuid,
      '${FIXTURE.lunchDayBId}'::uuid
    );

    delete from public.lunch_providers
    where id in (
      '${FIXTURE.providerAId}'::uuid,
      '${FIXTURE.providerBId}'::uuid
    );

    perform set_config('app.allow_lunch_period_write', 'true', true);
    delete from public.lunch_periods
    where id = '${FIXTURE.periodId}'::uuid;
    perform set_config('app.allow_lunch_period_write', '', true);
    end
    $fixture_cleanup$;
  `);
}

function applyFixture() {
  restoreFixture();
  runLocalDbExec(`
    do $fixture_setup$
    begin
    insert into public.lunch_providers (id, name, active, primary_order_email)
    values
      (
        '${FIXTURE.providerAId}'::uuid,
        'A Finalization Fixture Provider',
        true,
        'bug8-fixture-a@example.test'
      ),
      (
        '${FIXTURE.providerBId}'::uuid,
        'Z Finalization Fixture Provider',
        true,
        'bug8-fixture-b@example.test'
      );

    perform set_config('app.allow_lunch_period_write', 'true', true);
    insert into public.lunch_periods (
      id, label, start_date, end_date, is_current
    )
    values (
      '${FIXTURE.periodId}'::uuid,
      'E2E Finalization Blockers',
      '2040-01-01',
      '2040-01-31',
      false
    );
    perform set_config('app.allow_lunch_period_write', '', true);

    insert into public.lunch_days (
      id, lunch_date, order_date, provider_id, order_deadline, status, notes
    )
    values
      (
        '${FIXTURE.lunchDayAId}'::uuid,
        '2040-01-04',
        '2040-01-02',
        '${FIXTURE.providerAId}'::uuid,
        '2040-01-02 21:00:00+00',
        'open',
        'Bug 8 deterministic E2E fixture A'
      ),
      (
        '${FIXTURE.lunchDayBId}'::uuid,
        '2040-01-05',
        '2040-01-03',
        '${FIXTURE.providerBId}'::uuid,
        '2040-01-03 21:00:00+00',
        'open',
        'Bug 8 deterministic E2E fixture B'
      );

    insert into public.menu_items (
      id, lunch_day_id, name, price, item_type, unit_label, is_active
    )
    values
      (
        '${FIXTURE.menuItemAId}'::uuid,
        '${FIXTURE.lunchDayAId}'::uuid,
        'Fixture Meal A',
        900,
        'standalone',
        'Each',
        true
      ),
      (
        '${FIXTURE.menuItemBId}'::uuid,
        '${FIXTURE.lunchDayBId}'::uuid,
        'Fixture Meal B',
        1100,
        'standalone',
        'Each',
        true
      );

    insert into public.orders (
      id, profile_id, lunch_day_id, status, delivery_state,
      financial_disposition, delivery_issue_type,
      office_location_name, order_group_id, created_at, updated_at
    )
    values
      (
        '${FIXTURE.orderAId}'::uuid,
        '10000004-0004-4004-8004-000000000004'::uuid,
        '${FIXTURE.lunchDayAId}'::uuid,
        'submitted',
        'pending',
        'chargeable',
        null,
        'Kingston Fixture Office',
        '87600000-0000-4000-8000-000000000001'::uuid,
        '2040-01-02 10:00:00+00',
        '2040-01-02 10:00:00+00'
      ),
      (
        '${FIXTURE.orderBId}'::uuid,
        '10000005-0005-4005-8005-000000000005'::uuid,
        '${FIXTURE.lunchDayBId}'::uuid,
        'submitted',
        'issue_open',
        'on_hold',
        'not_delivered',
        'Montego Bay Fixture Office',
        '87600000-0000-4000-8000-000000000002'::uuid,
        '2040-01-03 10:00:00+00',
        '2040-01-03 10:00:00+00'
      );

    insert into public.order_items (
      order_id, menu_item_id, lunch_day_id, quantity, unit_price
    )
    values
      (
        '${FIXTURE.orderAId}'::uuid,
        '${FIXTURE.menuItemAId}'::uuid,
        '${FIXTURE.lunchDayAId}'::uuid,
        1,
        900
      ),
      (
        '${FIXTURE.orderBId}'::uuid,
        '${FIXTURE.menuItemBId}'::uuid,
        '${FIXTURE.lunchDayBId}'::uuid,
        1,
        1100
      );
    end
    $fixture_setup$;
  `);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|admin)/, { timeout: 30_000 });
}

async function startHrSupportMode(page: Page) {
  await page.goto("/admin/support", { waitUntil: "networkidle" });
  const exitSupport = page.getByRole("button", { name: "Exit Support Mode" }).first();
  if (await exitSupport.isVisible()) {
    await exitSupport.click();
    await page.waitForLoadState("networkidle");
  }

  await page.getByRole("button", { name: /^HR Support\b/i }).click();
  await page.getByLabel("Reason for support access").fill("Bug 8 blocker read-only E2E");
  await page.getByRole("dialog").getByRole("button", { name: "Start Support Mode" }).click();
  await expect(page.getByText("Support Mode: HR")).toBeVisible({ timeout: 30_000 });
}

async function expectAccountsBlockerRegionAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[aria-labelledby="financial-finalization-blockers-heading"]')
    .withTags([...STAFF_AXE_WCAG_TAGS])
    .analyze();
  expect(
    results.violations,
    `populated Accounts finalization blockers - axe violations:\n${formatAxeViolations(results)}`,
  ).toHaveLength(0);
}

async function expectHrBlockerRegionAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .include('[aria-labelledby="period-blocker-orders-heading"]')
    .withTags([...STAFF_AXE_WCAG_TAGS])
    // Reused operational controls inherit the existing global primary-button
    // contrast tracked outside Bug #8. Keep this focused regression strict for
    // every other A/AA rule in the new period-scoped region.
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    results.violations,
    `${label} - axe violations:\n${formatAxeViolations(results)}`,
  ).toHaveLength(0);
}

test.describe("financial finalization blocker visibility", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    loadLocalEnvFiles();
    applyFixture();
  });

  test.afterAll(() => {
    restoreFixture();
  });

  test("Accounts receives populated safe blocker details at desktop and narrow widths", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const password = requireStaffCredentials().password;
    await signIn(
      page,
      process.env.E2E_ACCOUNTS_EMAIL?.trim() || "accounts@lunch.test",
      password,
    );
    await page.goto(`/admin/financials?periodId=${FIXTURE.periodId}`, {
      waitUntil: "networkidle",
    });

    const blockerSection = page.getByRole("region", { name: "Orders HR must reconcile" });
    await expect(blockerSection).toBeVisible();
    await expect(blockerSection.getByText("Outstanding orders", { exact: true }).locator(".."))
      .toContainText("2");
    await expect(
      blockerSection.getByText("Pending delivery", { exact: true }).first().locator(".."),
    )
      .toContainText("1");
    await expect(
      blockerSection.getByText("Open issue", { exact: true }).first().locator(".."),
    )
      .toContainText("1");
    await expect(blockerSection.getByText("Financial hold", { exact: true }).locator(".."))
      .toContainText("0");

    const rows = blockerSection.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("A Finalization Fixture Provider");
    await expect(rows.nth(0)).toContainText("Delivery confirmation pending");
    await expect(rows.nth(1)).toContainText("Z Finalization Fixture Provider");
    await expect(rows.nth(1)).toContainText("Open delivery issue");
    await expect(rows.nth(1)).toContainText("Employee charge is on hold");
    await expect(blockerSection.getByText(/Employee ID|payroll|individual spending/i)).toHaveCount(0);
    await expectAccountsBlockerRegionAccessible(page);

    await page.setViewportSize({ width: 375, height: 720 });
    const mainMetrics = await page.locator("#main-content").evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(mainMetrics.scrollWidth).toBeLessThanOrEqual(mainMetrics.clientWidth + 1);
    await expect(blockerSection).toBeVisible();
  });

  test("permanent HR sees associated records and reconciliation controls", async ({ page }) => {
    test.setTimeout(120_000);
    const credentials = requireHrCredentials();
    await signIn(page, credentials.email, credentials.password);
    await page.goto(
      `/admin/orders/finalization-blockers?periodId=${FIXTURE.periodId}`,
      { waitUntil: "networkidle" },
    );

    await expect(
      page.getByRole("heading", { name: "Financial finalization blockers" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "2 outstanding orders" })).toBeVisible();
    const reasonPanels = page.getByText("Why this order blocks finalization");
    await expect(reasonPanels).toHaveCount(2);
    await expect(page.getByText("A Finalization Fixture Provider")).toBeVisible();
    await expect(page.getByText("Z Finalization Fixture Provider")).toBeVisible();
    await expect(page.getByText("Fixture Meal A × 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture Meal B × 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Report issue").first()).toBeVisible();
    await expect(page.getByText("Resolve no charge").first()).toBeVisible();
    await expectHrBlockerRegionAccessible(page, "populated HR finalization blockers");
  });

  test("HR Support Mode sees the same current records without mutation controls", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const credentials = requireOwnerCredentials();
    await signIn(page, credentials.email, credentials.password);
    await startHrSupportMode(page);

    try {
      await page.goto(
        `/admin/orders/finalization-blockers?periodId=${FIXTURE.periodId}`,
        { waitUntil: "networkidle" },
      );
      await expect(page.getByText(/Support Mode is read-only/)).toBeVisible();
      await expect(page.getByRole("heading", { name: "2 outstanding orders" })).toBeVisible();
      await expect(page.getByText("A Finalization Fixture Provider")).toBeVisible();
      await expect(page.getByText("Z Finalization Fixture Provider")).toBeVisible();
      await expect(page.getByText("Report issue")).toHaveCount(0);
      await expect(page.getByText("Resolve no charge")).toHaveCount(0);
      await expect(page.getByText("Confirm delivered")).toHaveCount(0);
      await expectHrBlockerRegionAccessible(page, "HR Support Mode finalization blockers");
    } finally {
      await page.goto("/admin/support", { waitUntil: "networkidle" });
      const exitSupport = page.getByRole("button", { name: "Exit Support Mode" }).first();
      if (await exitSupport.isVisible()) {
        await exitSupport.click();
        await page.waitForLoadState("networkidle");
      }
    }
  });
});
