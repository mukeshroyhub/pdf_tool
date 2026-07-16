import { defineConfig } from "@playwright/test";

/**
 * E2E smoke tests. Starts the API and the web app, then drives a real
 * Chromium through the core user journey. Run locally with:
 *
 *   npx playwright install chromium   (first time)
 *   npm run test:e2e
 *
 * In CI this runs as an advisory job (see .github/workflows) until it has
 * proven stable, then it can be promoted to a hard gate.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
