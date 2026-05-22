import { destructive, expect, test } from "../fixtures"

test.describe("agent editor — wizard de novo agente (destrutivo)", () => {
  destructive(
    "cria um agente Atendente em menos de 60s sem abrir avançado",
    async (page) => {
      const start = Date.now()
      await page.goto("/agent/editor")
      await page
        .getByRole("button", { name: /Novo agente/ })
        .first()
        .click()

      // Step 1: template
      const wizard = page
        .getByRole("dialog", { name: /Novo agente/ })
        .or(page.getByText("Passos do wizard", { exact: false }))
      await expect(wizard.first()).toBeVisible()
      await page
        .getByRole("radio", { name: /Atendente/i })
        .first()
        .click()
      await page.getByRole("button", { name: /Avançar/ }).click()

      // Step 2: identidade
      const name = `e2e-atendente-${Date.now().toString().slice(-5)}`
      await page.getByLabel(/Nome exibido/).fill(name)
      await page.getByRole("button", { name: /Avançar/ }).click()

      // Step 3: papel — pula
      await page.getByRole("button", { name: /Avançar/ }).click()

      // Step 4: prompt — pula
      await page.getByRole("button", { name: /Avançar/ }).click()

      // Step 5: review + criar
      await page.getByRole("button", { name: /Criar agente/ }).click()

      // Sidebar deve passar a mostrar o novo agente
      await expect(page.getByText(name, { exact: false })).toBeVisible({
        timeout: 15_000,
      })
      const elapsed = (Date.now() - start) / 1000
      expect(elapsed).toBeLessThan(60)
    },
  )

  destructive(
    "wizard bloqueia ID duplicado no passo de Identidade",
    async (page) => {
      await page.goto("/agent/editor")
      await page
        .getByRole("button", { name: /Novo agente/ })
        .first()
        .click()
      await page
        .getByRole("radio", { name: /Atendente/i })
        .first()
        .click()
      await page.getByRole("button", { name: /Avançar/ }).click()
      await page.getByLabel(/Nome exibido/).fill("Ana")
      await page.getByLabel(/ID técnico/).fill("main")
      await expect(
        page.getByRole("alert").filter({ hasText: /já existe/ }),
      ).toBeVisible()
      await expect(page.getByRole("button", { name: /Avançar/ })).toBeDisabled()
    },
  )
})
