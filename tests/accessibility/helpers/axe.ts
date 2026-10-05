import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { AxeResults } from "axe-core";

/** WCAG A/AA tags used for Staff regression scans (axe-core). */
export const STAFF_AXE_WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

export type StaffAxeScanOptions = {
  /** Limit scan to route body (additional state checks). */
  mainContentOnly?: boolean;
  /** Full document: AppShell, nav, header, main, live regions. */
  fullPage?: boolean;
};

export function createStaffAxeBuilder(page: Page, options?: StaffAxeScanOptions) {
  let builder = new AxeBuilder({ page }).withTags([...STAFF_AXE_WCAG_TAGS]);
  if (options?.mainContentOnly) {
    builder = builder.include("#main-content");
  }
  return builder;
}

export function formatAxeViolations(results: AxeResults): string {
  if (results.violations.length === 0) {
    return "";
  }

  return results.violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
        .join("\n");
      return [
        `[${violation.impact}] ${violation.id}`,
        `  ${violation.help}`,
        `  ${violation.helpUrl}`,
        nodes,
      ].join("\n");
    })
    .join("\n\n");
}

export async function expectNoAxeViolations(
  page: Page,
  contextLabel: string,
  options?: StaffAxeScanOptions,
) {
  const results = await createStaffAxeBuilder(page, options).analyze();
  expect(
    results.violations,
    `${contextLabel} — axe violations:\n${formatAxeViolations(results)}`,
  ).toHaveLength(0);
}
