import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const staffAuthFile = path.join(__dirname, "tests/accessibility/.auth/staff.json");

export default defineConfig({
  globalSetup: path.join(__dirname, "tests/accessibility/global-setup.ts"),
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
        /staff-late-order-drawer\.spec\.ts/,
        /staff-late-order-submission-edit\.spec\.ts/,
        /hr-todays-orders-modals\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
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
      name: "firefox-smoke",
      testMatch: /firefox-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        storageState: staffAuthFile,
      },
      dependencies: ["setup"],
    },
  ],
});
