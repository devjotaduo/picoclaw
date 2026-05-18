import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the agent editor E2E suite.
 *
 * The launcher is expected to be running locally on
 * http://localhost:18800 (DEV systemd service on the box, or
 * `make build-launcher && ./bin/picoclaw-launcher` in another shell).
 *
 * Override the target via `PLAYWRIGHT_BASE_URL` for staging runs.
 *
 * Destructive specs (creating / duplicating / removing agents,
 * restoring versions) are gated behind `E2E_DESTRUCTIVE=1`. Plain
 * `pnpm test:e2e` runs only the read-only smoke checks.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "./e2e/.report", open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:18800",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
