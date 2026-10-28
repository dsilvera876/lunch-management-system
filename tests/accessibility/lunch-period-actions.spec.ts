import { expect, test, type Page } from "@playwright/test";
import { runLocalDbExec, runLocalDbQuery } from "./helpers/e2e-local-db";
import {
  isLocalSupabaseApiUrl,
  loadLocalEnvFiles,
} from "./helpers/e2e-ordering-fixture";

const PERIOD_ID = "89000000-0000-4000-8000-000000000001";
const FIXTURE_LABEL = "E2E test-owned lunch period";
const TEST_LABEL = "E2E lunch period save";

function assertLocalTargets() {
  loadLocalEnvFiles();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!isLocalSupabaseApiUrl(supabaseUrl)) {
    throw new Error(
      "[lunch-period actions] Refusing fixture mutation because Supabase is not loopback.",
    );
  }

  const baseUrl = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  );
  if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
    throw new Error(
      "[lunch-period actions] Refusing fixture mutation because the app is not loopback.",
    );
  }
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function removeTestPeriod() {
  runLocalDbExec(`
    do $fixture_cleanup$
    begin
      perform set_config('app.allow_lunch_period_write', 'true', true);
      delete from public.lunch_periods
      where id = '${PERIOD_ID}'::uuid;
      perform set_config('app.allow_lunch_period_write', '', true);
    end
    $fixture_cleanup$;
  `);
}

function createTestPeriod() {
  removeTestPeriod();
  runLocalDbExec(`
    do $fixture_create$
    declare
      v_start_date date;
    begin
      select coalesce(max(end_date) + 1, date '2026-01-01')
      into v_start_date
      from public.lunch_periods;

      perform set_config('app.allow_lunch_period_write', 'true', true);
      insert into public.lunch_periods (
        id,
        label,
        start_date,
        end_date,
        is_current,
        status
      ) values (
        '${PERIOD_ID}'::uuid,
        ${sqlText(FIXTURE_LABEL)},
        v_start_date,
        v_start_date + 6,
        false,
        'open'
      );
      perform set_config('app.allow_lunch_period_write', '', true);
    end
    $fixture_create$;
  `);
}

async function signInAsAccounts(page: Page) {
  const email = process.env.E2E_ACCOUNTS_EMAIL?.trim() || "accounts@lunch.test";
  const password =
    process.env.E2E_ACCOUNTS_PASSWORD ?? process.env.E2E_STAFF_PASSWORD;
  if (!password) {
    throw new Error(
      "Set E2E_STAFF_PASSWORD or E2E_ACCOUNTS_PASSWORD for the local Accounts fixture.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|admin)/, { timeout: 30_000 });
}

test.describe("real lunch-period Server Action lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    assertLocalTargets();
    createTestPeriod();
    const rows = runLocalDbQuery(`
      select label
      from public.lunch_periods
      where id = '${PERIOD_ID}'::uuid
        and id = (
          select id
          from public.lunch_periods
          order by end_date desc, id desc
          limit 1
        )
    `);
    if (rows.length !== 1 || rows[0]?.label !== FIXTURE_LABEL) {
      throw new Error(
        "[lunch-period actions] Expected the isolated test period to be the latest period.",
      );
    }
  });

  test.afterEach(() => {
    removeTestPeriod();
  });

  test.afterAll(() => {
    removeTestPeriod();
  });

  test("refreshes authoritative data without scrolling, restores focus, and guards duplicate posts", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 420 });
    await signInAsAccounts(page);
    await page.goto("/admin/lunch-periods", { waitUntil: "networkidle" });

    let serverActionPosts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/admin/lunch-periods") &&
        request.headers()["next-action"]
      ) {
        serverActionPosts += 1;
      }
    });

    const originalRow = page.locator("tbody tr").filter({ hasText: FIXTURE_LABEL });
    await originalRow.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Label", { exact: true }).fill(TEST_LABEL);
    const saveButton = page.getByRole("button", { name: "Save label" });
    await saveButton.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await saveButton.evaluate((button) => {
      const form = (button as HTMLButtonElement).form;
      if (!form) throw new Error("Save label button has no form owner");
      form.requestSubmit(button as HTMLButtonElement);
      form.requestSubmit(button as HTMLButtonElement);
    });

    await expect(
      page.getByRole("status").filter({
        hasText: "Lunch period updated successfully.",
      }),
    ).toBeVisible();
    const updatedRow = page.locator("tbody tr").filter({ hasText: TEST_LABEL });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.getByRole("button", { name: "Edit" })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expect.poll(() => serverActionPosts).toBe(1);
    await page
      .getByRole("button", {
        name: "Dismiss Lunch period updated successfully. notification",
      })
      .click();

    await updatedRow.getByRole("button", { name: "Edit" }).click();
    await page.locator('input[name="periodId"]').first().evaluate((input) => {
      (input as HTMLInputElement).value = "00000000-0000-4000-8000-000000000099";
    });
    await page.getByRole("button", { name: "Save label" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Unable to complete that lunch period action.",
      }),
    ).toHaveText("Unable to complete that lunch period action.");
    await expect.poll(() => serverActionPosts).toBe(2);
    await expect(
      page.getByRole("status").filter({
        hasText: "Lunch period updated successfully.",
      }),
    ).toHaveCount(0);
  });
});
