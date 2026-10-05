import { expect, test, type Page } from "@playwright/test";

export async function gotoLunchOrdering(page: Page) {
  await page.goto("/lunch");
}

/** Core tests require open ordering; global fixture must guarantee provider tabs. */
export async function expectProviderOrderingReady(page: Page) {
  await expect(page.getByRole("tablist", { name: "Lunch providers" })).toBeVisible({
    timeout: 15_000,
  });
}

/** @deprecated use expectProviderOrderingReady — kept so stale imports fail visibly. */
export async function skipUnlessProviderTabs(page: Page) {
  await expectProviderOrderingReady(page);
}

export async function expectLocationPicker(page: Page) {
  const change = page.getByRole("button", { name: /· Change|· Choose/i }).first();
  await expect(change).toBeVisible();
}

export async function skipUnlessLocationPicker(page: Page) {
  const change = page.getByRole("button", { name: /· Change|· Choose/i });
  const visible = await change.first().isVisible().catch(() => false);
  if (!visible) {
    test.skip(true, "Delivery location picker unavailable on this screen");
  }
}
