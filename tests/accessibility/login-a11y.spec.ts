import { test, expect, type Page } from "@playwright/test";
import { createStaffAxeBuilder, expectNoAxeViolations, formatAxeViolations } from "./helpers/axe";
import { loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";
import { requireStaffCredentials } from "./helpers/env";

/** PRL-010 regression: sign-in landmark, contrast, error association, email retention, pending. */
test.describe("Login — accessibility (PRL-010)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    loadLocalEnvFiles();
  });

  test("has a main landmark, a descriptive title and no axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Sign in | Lunch Management System");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Lunch Management System" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "/login");
  });

  /**
   * Signup and reset pages share AuthLayout. Their own links and buttons still use the older teal
   * (tracked in the backlog), so these layout checks exclude color-contrast.
   */
  async function expectSharedAuthLayout(page: Page, label: string) {
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible();
    const results = await createStaffAxeBuilder(page).disableRules(["color-contrast"]).analyze();
    expect(results.violations, `${label}:\n${formatAxeViolations(results)}`).toHaveLength(0);
  }

  for (const { path, title } of [
    { path: "/signup", title: "Create account" },
    { path: "/forgot-password", title: "Reset password" },
  ]) {
    test(`shared auth layout on ${path} keeps one main landmark`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(`${title} | Lunch Management System`);
      await expectSharedAuthLayout(page, path);
    });
  }

  test("password reset link without a session lands on the shared auth layout", async ({ page }) => {
    await page.goto("/account/update-password?recovery=1");
    expect(await page.title()).toMatch(/ \| Lunch Management System$/);
    await expectSharedAuthLayout(page, page.url());
  });

  test("a failed sign-in keeps the email, focuses the error and describes both fields", async ({
    page,
  }) => {
    const { email } = requireStaffCredentials();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const error = page.getByText("Unable to sign in. Check your email and password.");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toBeFocused();

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.search).toBe("");
    expect(page.url()).not.toContain(encodeURIComponent(email));
    expect(page.url()).not.toContain(email);

    await expect(page.getByLabel("Email")).toHaveValue(email);
    await expect(page.getByLabel("Password")).toHaveValue("");

    const errorId = await error.getAttribute("id");
    expect(errorId).toBeTruthy();
    for (const label of ["Email", "Password"]) {
      const field = page.getByLabel(label);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toHaveAttribute("aria-describedby", errorId!);
    }

    await expectNoAxeViolations(page, "/login after failed sign-in");

    await page.getByLabel("Password").fill("still-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(error).toBeFocused({ timeout: 20_000 });
  });

  test("submission shows progress and blocks a duplicate submit", async ({ page }) => {
    const { email, password } = requireStaffCredentials();
    let actionPosts = 0;
    await page.route("**/login", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        actionPosts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const submit = page.locator("form button[type=submit]");
    await submit.click();

    await expect(submit).toHaveText("Signing in…");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(submit).toBeFocused();
    await submit.click({ force: true });

    await page.waitForURL(/\/home/, { timeout: 30_000 });
    expect(actionPosts).toBe(1);
    await expect(page).toHaveTitle("Home | Lunch Management System");
  });
});
