import { test as setup } from "@playwright/test";
import path from "node:path";
import { hasStaffCredentials, requireStaffCredentials } from "./helpers/env";
import { ensureLocalStaffOrderingFixtureForPlaywright, loadLocalEnvFiles } from "./helpers/e2e-ordering-fixture";

const authFile = path.join(__dirname, ".auth/staff.json");

setup("authenticate staff user", async ({ page }) => {
  loadLocalEnvFiles();
  ensureLocalStaffOrderingFixtureForPlaywright();
  if (!hasStaffCredentials()) {
    throw new Error(
      "Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD before running test:a11y " +
        "(see tests/accessibility/README.md).",
    );
  }

  const { email, password } = requireStaffCredentials();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|lunch|my-orders|account|financials)/, { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
