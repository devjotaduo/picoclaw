import { type Page, test as base, expect } from "@playwright/test"

/**
 * Marks a test as destructive — it creates / modifies / deletes
 * real agents on the target launcher. Gated by `E2E_DESTRUCTIVE=1`
 * so a default `pnpm test:e2e` run is safe to run anywhere.
 */
export function destructive(name: string, fn: (page: Page) => Promise<void>) {
  test(name, async ({ page }) => {
    test.skip(
      process.env.E2E_DESTRUCTIVE !== "1",
      "destructive — set E2E_DESTRUCTIVE=1 to run",
    )
    await fn(page)
  })
}

export const test = base.extend<{ editor: Page }>({
  editor: async ({ page }, run) => {
    await page.goto("/agent/editor")
    // Wait for either the empty state or at least one agent card in the sidebar.
    await page.waitForLoadState("networkidle")
    await expect(
      page
        .getByRole("heading", { level: 2 })
        .first()
        .or(page.getByText(/agente/i).first()),
    ).toBeVisible({ timeout: 15_000 })
    await run(page)
  },
})

export { expect }
