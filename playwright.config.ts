import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const staffAuthFile = path.join(__dirname, "tests/accessibility/.auth/staff.json");
const mostPopularPlaywrightOnly = process.env.PLAYWRIGHT_MOST_POPULAR_ONLY === "1";
const menuItemRatingsPlaywrightOnly = process.env.PLAYWRIGHT_MENU_ITEM_RATINGS_ONLY === "1";
const emailPreviewPlaywrightOnly = process.env.PLAYWRIGHT_EMAIL_PREVIEW_ONLY === "1";
/** Checkout a11y against a local server that simulates a Jamaica weekday (see README). */
const simulatedWeekdayPlaywright = process.env.PLAYWRIGHT_SIMULATED_WEEKDAY === "1";
/** Login, page-title and late-order drawer a11y; needs no open self-service ordering. */
const phase2aPlaywrightOnly = process.env.PLAYWRIGHT_PHASE_2A_ONLY === "1";
const deliveriesReconciliationPlaywrightOnly =
  process.env.PLAYWRIGHT_DELIVERIES_RECONCILIATION_ONLY === "1";
const supportModeExpirationPlaywrightOnly =
  process.env.PLAYWRIGHT_SUPPORT_MODE_EXPIRATION_ONLY === "1";
const skipOrderingGlobalSetup =
  mostPopularPlaywrightOnly ||
  menuItemRatingsPlaywrightOnly ||
  emailPreviewPlaywrightOnly ||
  phase2aPlaywrightOnly ||
  deliveriesReconciliationPlaywrightOnly ||
  supportModeExpirationPlaywrightOnly;
const phase2aSpecs = /(login-a11y|page-titles|staff-late-order-drawer-focus)\.spec\.ts/;
const staffPrl011012Spec = /staff-prl-011-012\.spec\.ts/;
const adminDeliveriesReconciliationSpec = /admin-deliveries-reconciliation\.spec\.ts/;
const supportModeExpirationSpec = /support-mode-expiration\.spec\.ts/;

export default defineConfig({
  globalSetup: path.join(
    __dirname,
    simulatedWeekdayPlaywright
      ? "tests/accessibility/global-setup-simulated-weekday.ts"
      : deliveriesReconciliationPlaywrightOnly
        ? "tests/accessibility/global-setup-deliveries-reconciliation.ts"
        : skipOrderingGlobalSetup
          ? "tests/accessibility/global-setup-most-popular.ts"
          : "tests/accessibility/global-setup.ts",
  ),
  globalTeardown: path.join(__dirname, "tests/accessibility/global-teardown.ts"),
  testDir: path.join(__dirname, "tests/accessibility"),
  testIgnore: ["**/helpers/**", "**/*.test.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium-a11y",
      testIgnore: [
        /firefox-smoke\.spec\.ts/,
        /operational-attention-bell\.spec\.ts/,
        /staff-late-order-drawer\.spec\.ts/,
        /staff-late-order-submission-edit\.spec\.ts/,
        /hr-todays-orders-modals\.spec\.ts/,
        /hr-menu-item-ratings\.spec\.ts/,
        /menu-item-ratings\.spec\.ts/,
        /menu-item-most-popular\.spec\.ts/,
        /email-preview-sandbox\.spec\.ts/,
        /staff-checkout-a11y\.spec\.ts/,
        adminDeliveriesReconciliationSpec,
        supportModeExpirationSpec,
        phase2aSpecs,
        staffPrl011012Spec,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "chromium-staff-prl-a11y",
      testMatch: staffPrl011012Spec,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-staff-prl-a11y",
      testMatch: staffPrl011012Spec,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup", "chromium-staff-prl-a11y"],
    },
    {
      name: "chromium-checkout-a11y",
      testMatch: /staff-checkout-a11y\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-checkout-a11y",
      testMatch: /staff-checkout-a11y\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup", "chromium-checkout-a11y"],
    },
    {
      name: "chromium-phase-2a-a11y",
      testMatch: phase2aSpecs,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-phase-2a-a11y",
      testMatch: phase2aSpecs,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup", "chromium-phase-2a-a11y"],
    },
    {
      name: "chromium-late-order-a11y",
      testMatch: /staff-late-order-(drawer|submission-edit)\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup", "chromium-a11y"],
    },
    {
      name: "chromium-hr-todays-orders-a11y",
      testMatch: /hr-todays-orders-modals\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup", "chromium-a11y", "chromium-late-order-a11y"],
    },
    {
      name: "chromium-hr-ratings-a11y",
      testMatch: /hr-menu-item-ratings\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: [],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-hr-ratings-a11y",
      testMatch: /hr-menu-item-ratings\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-hr-ratings-a11y"],
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "chromium-menu-item-ratings-a11y",
      testMatch: /\/menu-item-ratings\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-menu-item-ratings-a11y",
      testMatch: /\/menu-item-ratings\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-menu-item-ratings-a11y"],
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
    },
    {
      name: "chromium-most-popular-a11y",
      testMatch: /menu-item-most-popular\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox-most-popular-a11y",
      testMatch: /menu-item-most-popular\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-most-popular-a11y"],
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
    },
    {
      name: "chromium-email-preview-security",
      testMatch: /email-preview-sandbox\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-email-preview-security",
      testMatch: /email-preview-sandbox\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-email-preview-security"],
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "firefox-smoke",
      testMatch: /firefox-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
    {
      name: "chromium-operational-bell",
      testMatch: /operational-attention-bell\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-operational-bell",
      testMatch: /operational-attention-bell\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "chromium-deliveries-reconciliation",
      testMatch: adminDeliveriesReconciliationSpec,
      fullyParallel: false,
      workers: 1,
      dependencies: [],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-deliveries-reconciliation",
      testMatch: adminDeliveriesReconciliationSpec,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-deliveries-reconciliation"],
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "chromium-support-mode-expiration",
      testMatch: supportModeExpirationSpec,
      fullyParallel: false,
      workers: 1,
      dependencies: [],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-support-mode-expiration",
      testMatch: supportModeExpirationSpec,
      fullyParallel: false,
      workers: 1,
      dependencies: ["chromium-support-mode-expiration"],
      use: {
        ...devices["Desktop Firefox"],
      },
    },
  ],
});
