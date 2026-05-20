import path from "path"
import { fileURLToPath } from "url"

import { defineConfig, devices } from "@playwright/test"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Playwright config for the agent editor E2E suite.
 *
 * The launcher is expected to be running locally on
 * http://localhost:18800 (DEV systemd service on the box, or
 * `make build-launcher && ./bin/picoclaw-launcher` in another shell).
 *
 * Override the target via `E2E_BASE_URL` (preferred) or
 * `PLAYWRIGHT_BASE_URL` for staging runs.
 *
 * Authentication: `global-setup.ts` posts to /api/auth/login with
 * E2E_PASSWORD (if set) and persists cookies to
 * `e2e/.auth/launcher.json`. Every test then reuses that storage state
 * via `use.storageState`.
 *
 * Destructive specs (creating / duplicating / removing agents,
 * restoring versions) are gated behind `E2E_DESTRUCTIVE=1`. Plain
 * `pnpm test:e2e` runs only the read-only smoke checks.
 */
const AUTH_STATE = path.join(__dirname, "e2e", ".auth", "launcher.json")

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e/.report", open: "never" }],
  ],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL:
      process.env.E2E_BASE_URL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://localhost:18800",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
    storageState: AUTH_STATE,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
