import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Smart Procurement E2E tests.
 *
 * The Vite dev server is started automatically before the suite runs.
 * API calls that reach the FastAPI backend (/api/validate, /api/requests,
 * /api/categories) are intercepted with route mocks so that tests never
 * require real Azure OpenAI credentials.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  outputDir: "test-results/",
});
