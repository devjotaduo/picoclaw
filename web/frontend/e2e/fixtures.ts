import { type Page, expect, test as base } from "@playwright/test"

/**
 * Marks a test as destructive — it creates / modifies / deletes
 * real agents on the target launcher. Gated by `E2E_DESTRUCTIVE=1`
 * so a default `pnpm test:e2e` run is safe to run anywhere.
 */
export function destructive(name: string, fn: (page: Page) => Promise<void>) {
  const condition = process.env.E2E_DESTRUCTIVE === "1"
  test.skip(!condition, "destructive — set E2E_DESTRUCTIVE=1 to run")
  test(name, async ({ page }) => fn(page))
}

export const test = base.extend<{ editor: Page }>({
  editor: async ({ page }, use) => {
    await page.goto("/agent/editor")
    // Wait for either the empty state or at least one agent card in the sidebar.
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByRole("heading", { level: 2 }).first().or(page.getByText(/agente/i).first()),
    ).toBeVisible({ timeout: 15_000 })
    await use(page)
  },
})

export { expect }
