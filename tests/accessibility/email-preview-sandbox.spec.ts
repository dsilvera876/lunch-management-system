import { test, expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

/* Preview iframes are located inside #main-content: during client navigation a
   transient duplicate of the page can briefly exist outside the main region. */

import { requireOwnerCredentials } from "./helpers/env";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import {
  cleanupE2eEmailPreviewXssFixture,
  E2E_EMAIL_PREVIEW_BATCH_ID,
  LEGITIMATE_EMAIL_ITEM,
  LEGITIMATE_EMAIL_TEXT,
  seedE2eEmailPreviewXssFixture,
  STORED_XSS_EMAIL_HTML,
} from "./helpers/email-preview-xss-fixture";

test.use({ storageState: { cookies: [], origins: [] } });

async function loginAsOwner(page: Page) {
  const { email, password } = requireOwnerCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|admin|financials)/, { timeout: 30_000 });
}

/** Retries until the click/fill survives hydration of the client component. */
async function selectTab(tab: Locator) {
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
}

async function fillAndPreview(textarea: Locator, value: string, frame: FrameLocator) {
  await expect(async () => {
    await textarea.fill(value);
    await expect(frame.locator("#legit")).toBeAttached({ timeout: 1_000 });
  }).toPass();
}

async function expectSandboxedPreview(iframe: Locator) {
  await expect(iframe).toHaveAttribute("sandbox", "");
  const sandbox = (await iframe.getAttribute("sandbox")) ?? "";
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  await expect(iframe).toHaveAttribute("srcdoc", /Content-Security-Policy/);
}

async function expectLegitimateContent(frame: FrameLocator) {
  await expect(frame.locator("#legit")).toContainText(LEGITIMATE_EMAIL_TEXT);
  await expect(frame.locator("#legit strong")).toHaveText("Alex");
  await expect(frame.getByRole("listitem")).toHaveText(LEGITIMATE_EMAIL_ITEM);
}

async function expectNoScriptExecution(page: Page, frame: FrameLocator) {
  await expect(frame.locator("#xss-img")).toBeAttached();
  await expect(frame.locator("#xss-svg")).toBeAttached();
  // Give onerror/onload/script/meta refresh time to fire if they were allowed.
  await page.waitForTimeout(1_500);

  await expect(frame.locator("body")).not.toHaveAttribute("data-xss-script", /.*/);
  await expect(frame.locator("body")).not.toHaveAttribute("data-xss-svg", /.*/);
  await expect(frame.locator("#xss-img")).not.toHaveAttribute("data-xss-img", /.*/);
  expect(await page.evaluate(() => (window as { __emailXss?: unknown }).__emailXss)).toBeUndefined();
}

async function expectParentUnreachable(page: Page, frame: FrameLocator, heading: Locator) {
  const parentUrl = page.url();
  const popups: Page[] = [];
  page.context().on("page", (popup) => popups.push(popup));

  for (const selector of ["#xss-top", "#xss-js", "#xss-popup", "#xss-form"]) {
    await frame.locator(selector).click({ noWaitAfter: true });
  }
  await page.waitForTimeout(1_500);

  expect(page.url()).toBe(parentUrl);
  expect(popups).toHaveLength(0);
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => (window as { __emailXss?: unknown }).__emailXss)).toBeUndefined();

  // Still signed in: the sign-out form inside the preview must not have submitted.
  await page.reload();
  await expect(heading).toBeVisible();
}

test.describe("Admin email HTML previews", () => {
  test.beforeAll(() => {
    loadLocalEnvFiles();
    seedE2eEmailPreviewXssFixture();
  });

  test.afterAll(() => {
    cleanupE2eEmailPreviewXssFixture();
  });

  test("delivery detail safely displays stored malicious email HTML", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`/admin/settings/email/delivery/${E2E_EMAIL_PREVIEW_BATCH_ID}`);

    const heading = page.getByRole("heading", { name: /delivery details/i });
    await expect(heading).toBeVisible();
    await selectTab(page.getByRole("tab", { name: "Email content" }));

    const iframe = page.locator("#main-content").getByTitle("Rendered HTML email body");
    await expect(iframe).toBeVisible();
    await expectSandboxedPreview(iframe);

    const frame = iframe.contentFrame();
    await expectLegitimateContent(frame);
    await expectNoScriptExecution(page, frame);
    await expectParentUnreachable(page, frame, heading);
  });

  test("template editor preview does not execute edited markup", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/settings/email/templates/staff.today_menu");

    const heading = page.getByRole("heading", { name: "Edit Email Template" });
    await expect(heading).toBeVisible();
    const iframe = page.locator("#main-content").getByTitle("HTML email preview");
    const frame = iframe.contentFrame();
    await fillAndPreview(page.getByLabel("Body (HTML)"), STORED_XSS_EMAIL_HTML, frame);

    await expect(iframe).toBeVisible();
    await expectSandboxedPreview(iframe);
    await expectLegitimateContent(frame);
    await expectNoScriptExecution(page, frame);
    await expectParentUnreachable(page, frame, heading);
  });

  test("template editor preview renders legitimate sample content", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/settings/email/templates/staff.today_menu");
    await expect(page.getByRole("heading", { name: "Edit Email Template" })).toBeVisible();

    const iframe = page.locator("#main-content").getByTitle("HTML email preview");
    const frame = iframe.contentFrame();
    await fillAndPreview(
      page.getByLabel("Body (HTML)"),
      '<p id="legit">Hi {{first_name}}</p>{{mains}}<p><a href="{{order_url}}">Order</a></p>',
      frame,
    );
    await expectSandboxedPreview(iframe);
    await expect(frame.locator("#legit")).toHaveText("Hi Alex");
    await expect(frame.getByRole("listitem")).toHaveText([
      "Jerk Chicken",
      "Curry Fish",
      "Vegetable Pasta (V)",
    ]);
    await expect(frame.getByRole("link", { name: "Order" })).toHaveAttribute(
      "href",
      "https://example.com/lunch",
    );
  });
});
