import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import { requireHrCredentials } from "./helpers/env";

const PROVIDER_ALL_DATES_COLUMNS = [
  "Delivery Date",
  "Employee",
  "Order",
  "Qty",
  "Status",
  "Action",
];
const PROVIDER_SPECIFIC_DATE_COLUMNS = ["Employee", "Order", "Qty", "Status", "Action"];
const EMPLOYEE_HISTORY_COLUMNS = [
  "Delivery Date",
  "Provider",
  "Office",
  "Order",
  "Qty",
  "Status",
  "Action",
];

type TableLayout = {
  provider: string;
  columns: Array<{ label: string; left: number; right: number }>;
};

test.use({ storageState: { cookies: [], origins: [] } });

loadLocalEnvFiles();

async function signInAsHr(page: Page) {
  const { email, password } = requireHrCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|home)(?:\/|$)/, { timeout: 30_000 });
}

async function openAllDates(page: Page) {
  await page.goto("/admin/orders?deliveryDate=all", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Order History" })).toBeVisible();
  await expect
    .poll(() => page.locator("[data-order-history-provider-card]").count())
    .toBeGreaterThanOrEqual(2);

  const employeePicker = page.getByRole("combobox", { name: "Employee" });
  await expect
    .poll(async () => {
      if ((await employeePicker.getAttribute("aria-expanded")) === "true") {
        return true;
      }
      await employeePicker.click();
      return (await employeePicker.getAttribute("aria-expanded")) === "true";
    }, { message: "Order History controls should be hydrated" })
    .toBe(true);
  await employeePicker.click();
  await expect(employeePicker).toHaveAttribute("aria-expanded", "false");
}

async function readProviderTableLayouts(page: Page): Promise<TableLayout[]> {
  return page
    .locator('table[data-order-history-table-context="provider-office"]')
    .evaluateAll((tables) =>
      tables.map((table) => {
        const tableBox = table.getBoundingClientRect();
        const provider =
          table
            .closest("[data-order-history-provider-card]")
            ?.querySelector("h2")
            ?.textContent?.trim() ?? "";
        const columns = Array.from(table.querySelectorAll("thead th")).map((heading) => {
          const box = heading.getBoundingClientRect();
          return {
            label: heading.textContent?.trim() ?? "",
            left: box.left - tableBox.left,
            right: box.right - tableBox.left,
          };
        });
        return { provider, columns };
      }),
    );
}

async function expectProviderColumnsAligned(page: Page, expectedLabels: string[]) {
  const layouts = await readProviderTableLayouts(page);
  expect(layouts.length).toBeGreaterThanOrEqual(2);
  expect(new Set(layouts.map((layout) => layout.provider)).size).toBeGreaterThanOrEqual(2);

  const reference = layouts[0]!;
  expect(reference.columns.map((column) => column.label)).toEqual(expectedLabels);

  for (const layout of layouts.slice(1)) {
    expect(layout.columns.map((column) => column.label)).toEqual(expectedLabels);
    for (const [index, column] of layout.columns.entries()) {
      expect(Math.abs(column.left - reference.columns[index]!.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(column.right - reference.columns[index]!.right)).toBeLessThanOrEqual(1);
    }
  }
}

async function replaceFirstRowWithLongContent(page: Page) {
  const firstTable = page
    .locator('table[data-order-history-table-context="provider-office"]')
    .first();
  const employee = firstTable.locator('tbody td[data-order-history-column="employee"]').first();
  const order = firstTable.locator('tbody td[data-order-history-column="order"] p').first();

  await employee.evaluate((cell) => {
    cell.textContent = "Alexandra-Montgomery-Washington-Long-Employee-Display-Name";
  });
  await order.evaluate((line) => {
    line.textContent =
      "Slow-Braised-Chicken-With-Extraordinary-Provider-Preparation-Description-And-Sides";
  });

  return { employee, order };
}

async function expectContentWraps(locator: ReturnType<Page["locator"]>) {
  const dimensions = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.height).toBeGreaterThan(dimensions.lineHeight * 1.5);
}

async function findDateSharedByMultipleProviders(page: Page): Promise<string> {
  const providerDates = await page
    .locator("[data-order-history-provider-card]")
    .evaluateAll((cards) =>
      cards.map((card) =>
        Array.from(
          new Set(
            Array.from(card.querySelectorAll('td[data-order-history-column="delivery-date"]'))
              .map((cell) => cell.textContent?.trim() ?? "")
              .filter(Boolean),
          ),
        ),
      ),
    );
  const counts = new Map<string, number>();
  for (const dates of providerDates) {
    for (const date of dates) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  const sharedDate = Array.from(counts).find(([, count]) => count >= 2)?.[0];
  if (!sharedDate) {
    throw new Error(
      "Expected the local development fixture to include a date shared by two providers.",
    );
  }
  return sharedDate;
}

test.beforeEach(async ({ page }) => {
  await signInAsHr(page);
});

test("provider-card columns align with short and long content for All Dates", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAllDates(page);

  const longContent = await replaceFirstRowWithLongContent(page);
  await expectContentWraps(longContent.employee);
  await expectContentWraps(longContent.order);
  await expectProviderColumnsAligned(page, PROVIDER_ALL_DATES_COLUMNS);

  await page.setViewportSize({ width: 768, height: 900 });
  await expectProviderColumnsAligned(page, PROVIDER_ALL_DATES_COLUMNS);
});

test("specific-date provider cards keep the shared five-column profile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAllDates(page);
  const sharedDate = await findDateSharedByMultipleProviders(page);

  await page.getByLabel("Delivery date").selectOption({ label: sharedDate });
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/admin/orders" && url.searchParams.get("deliveryDate") !== "all",
    ),
    page.getByRole("button", { name: "Apply" }).click(),
  ]);
  await expect
    .poll(() => page.locator("[data-order-history-provider-card]").count())
    .toBeGreaterThanOrEqual(2);

  await replaceFirstRowWithLongContent(page);
  await expectProviderColumnsAligned(page, PROVIDER_SPECIFIC_DATE_COLUMNS);

  await page.setViewportSize({ width: 768, height: 900 });
  await expectProviderColumnsAligned(page, PROVIDER_SPECIFIC_DATE_COLUMNS);
  await expect(page.getByRole("columnheader", { name: "Delivery Date" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Print Delivery Sheet" }).first()).toBeVisible();
});

test("employee history keeps its columns and mobile overflow inside the table container", async ({
  page,
}) => {
  await openAllDates(page);
  await page.getByRole("combobox", { name: "Employee" }).click();
  await page.getByPlaceholder("Search by name or email").fill("staff1@lunch.test");
  await page.getByRole("option", { name: /Dev Staff One/ }).click();
  await Promise.all([
    page.waitForURL((url) => Boolean(url.searchParams.get("employee"))),
    page.getByRole("button", { name: "Apply" }).click(),
  ]);

  const employeeTable = page.locator(
    'table[data-order-history-table-context="employee-history"]',
  );
  await expect(employeeTable).toHaveCount(1);
  await expect(employeeTable.getByRole("columnheader")).toHaveText(EMPLOYEE_HISTORY_COLUMNS);

  await page.setViewportSize({ width: 375, height: 667 });
  await openAllDates(page);
  const scrollContainer = page.locator("[data-order-history-table-scroll]").first();
  await scrollContainer.scrollIntoViewIfNeeded();

  const overflow = await scrollContainer.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  await scrollContainer.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const viewDetails = scrollContainer.getByRole("button", { name: "View details" }).first();
  await expect(viewDetails).toBeVisible();
  await viewDetails.click();
  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
});
