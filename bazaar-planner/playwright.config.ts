import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/production.spec.ts", "**/local-import.spec.ts"],
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1100 },
    launchOptions: { executablePath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/test-preview.mjs",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  reporter: "list",
});
