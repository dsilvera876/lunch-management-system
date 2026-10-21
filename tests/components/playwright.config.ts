import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: path.join(__dirname),
  testMatch: /toast-provider\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  projects: [
    {
      name: "chromium-toast",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
