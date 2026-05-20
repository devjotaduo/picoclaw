import fs from "fs"
import path from "path"

import { type FullConfig, chromium, request } from "@playwright/test"

/**
 * Performs a one-time launcher dashboard login and persists the
 * session cookies to `e2e/.auth/launcher.json`. The Playwright
 * `use.storageState` option then loads this file for every test,
 * meaning specs never have to fight the login page.
 *
 * Inputs (env vars, set in CI or your shell):
 *   E2E_PASSWORD  — required for runs against a launcher with auth on
 *   E2E_BASE_URL  — defaults to `use.baseURL` from the config
 *
 * If E2E_PASSWORD is missing we skip login silently. That keeps
 * read-only local runs (against a launcher already logged in via
 * cookie or running without auth) working without ceremony.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.E2E_BASE_URL ??
    config.projects[0]?.use.baseURL ??
    "http://localhost:18800"
  const password = process.env.E2E_PASSWORD
  const authFile = path.join(config.rootDir, "e2e", ".auth", "launcher.json")

  if (!password) {
    if (process.env.CI) {
      // In CI we want to be loud about this — a missing secret is a
      // misconfiguration, not a silent skip.
      console.warn(
        "[e2e/global-setup] E2E_PASSWORD is not set; tests will run unauthenticated.",
      )
    }
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    fs.writeFileSync(
      authFile,
      JSON.stringify({ cookies: [], origins: [] }, null, 2),
    )
    return
  }

  // 1) Try the login API directly; this avoids spinning up a browser
  // when the server is reachable and the credential is good.
  const apiContext = await request.newContext({ baseURL })
  const apiRes = await apiContext.post("/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { password: password.trim() },
  })
  if (!apiRes.ok()) {
    const detail = (await apiRes.text()).slice(0, 200)
    throw new Error(
      `[e2e/global-setup] login API returned ${apiRes.status()}: ${detail}`,
    )
  }

  // 2) Persist via a real browser context so we capture every
  // cookie/origin the SPA expects (and not just the API-set cookie).
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ baseURL })
  const browserLoginRes = await ctx.request.post("/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { password: password.trim() },
  })
  if (!browserLoginRes.ok()) {
    const detail = (await browserLoginRes.text()).slice(0, 200)
    throw new Error(
      `[e2e/global-setup] browser-context login returned ${browserLoginRes.status()}: ${detail}`,
    )
  }
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await ctx.storageState({ path: authFile })
  await ctx.close()
  await browser.close()
  await apiContext.dispose()
}
