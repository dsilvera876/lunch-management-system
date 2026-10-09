import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { STAFF_AXE_WCAG_TAGS, formatAxeViolations } from "./helpers/axe";
import {
  applyHrTodaysOrdersModalFixture,
  restoreHrTodaysOrdersModalFixture,
} from "./helpers/e2e-ordering-fixture";
import { requireHrCredentials } from "./helpers/env";

test.describe("HR Today's Orders — edit and cancel modals", () => {
  test.describe.configure({ mode: "serial" });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.afterAll(() => {
    restoreHrTodaysOrdersModalFixture();
  });

  test.beforeEach(async ({ page }) => {
    applyHrTodaysOrdersModalFixture();
    const { email, password } = requireHrCredentials();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(admin\/todays-orders|home|admin)/, { timeout: 30_000 });
  });

  async function firstEditableEditButton(page: import("@playwright/test").Page) {
    await page.goto("/admin/todays-orders", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const edit = page.getByRole("table").getByRole("button", { name: "Edit" }).first();
    await expect(edit, "seeded submitted order with HR actions").toBeVisible({ timeout: 20_000 });
    await edit.scrollIntoViewIfNeeded();
    return edit;
  }

  async function openStaffModalFromTrigger(
    page: import("@playwright/test").Page,
    trigger: import("@playwright/test").Locator,
  ) {
    const dialog = page.locator("[data-staff-modal-dialog]");
    await expect(async () => {
      await trigger.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    return dialog;
  }

  test("edit modal — keyboard, focus, Escape, reason validation, axe", async ({ page }) => {
    const edit = await firstEditableEditButton(page);
    await edit.focus();
    const dialog = await openStaffModalFromTrigger(page, edit);

    await expect(page.getByRole("heading", { name: "Edit employee order" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit employee order" })).toBeFocused();

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/reason/i);

    const axeResults = await new AxeBuilder({ page })
      .withTags([...STAFF_AXE_WCAG_TAGS])
      .include("[data-staff-modal-dialog]")
      .analyze();
    expect(
      axeResults.violations,
      `HR edit modal — axe violations:\n${formatAxeViolations(axeResults)}`,
    ).toHaveLength(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(edit).toBeFocused();
  });

  test("cancel modal — keyboard, focus, Escape, required reason, axe", async ({ page }) => {
    await page.goto("/admin/todays-orders", { waitUntil: "domcontentloaded" });
    const cancel = page.getByRole("table").getByRole("button", { name: "Cancel" }).first();
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    await cancel.scrollIntoViewIfNeeded();
    await cancel.focus();
    const dialog = await openStaffModalFromTrigger(page, cancel);
    await expect(page.getByRole("heading", { name: "Cancel employee order" })).toBeFocused();

    const reason = dialog.getByLabel(/Reason/i);
    await expect(reason).toHaveAttribute("required", "");

    await dialog.getByRole("button", { name: "Cancel order", exact: true }).click();
    await expect(reason).toBeFocused();

    const axeResults = await new AxeBuilder({ page })
      .withTags([...STAFF_AXE_WCAG_TAGS])
      .include("[data-staff-modal-dialog]")
      .analyze();
    expect(
      axeResults.violations,
      `HR cancel modal — axe violations:\n${formatAxeViolations(axeResults)}`,
    ).toHaveLength(0);

    await dialog.getByRole("button", { name: "Keep order" }).click();
    await expect(dialog).toBeHidden();
    await expect(cancel).toBeFocused();

    await openStaffModalFromTrigger(page, cancel);
    await expect(page.getByRole("heading", { name: "Cancel employee order" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(cancel).toBeFocused();
  });
});
