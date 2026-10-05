import { expect, type Page } from "@playwright/test";

/** C2 short-height threshold (40rem) used in staff-accessibility.css. */
export const STAFF_SHORT_VIEWPORT_HEIGHT = 640;

export async function expectNoUnintendedHorizontalPageScroll(page: Page) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
  expect(
    metrics.scrollWidth,
    `Unexpected horizontal page overflow (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
