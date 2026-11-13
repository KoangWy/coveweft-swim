import { defineConfig, devices } from "@playwright/test";

// Use a dedicated port so the end-to-end run does not depend on the default
// development port being free.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Next dev compiles each route on its first request. Several workers asking
  // for new routes at the same time can make Turbopack return a truncated
  // payload, so the suite runs one test at a time.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Spawn Next directly: a pnpm wrapper can keep the pipe open after
        // Playwright stops the server, which makes the test run hang on exit.
        command: `node node_modules/next/dist/bin/next dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
