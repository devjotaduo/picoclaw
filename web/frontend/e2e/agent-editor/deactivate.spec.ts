import { destructive, expect, test } from "../fixtures"

test.describe("agent editor — desativar com confirmação (destrutivo)", () => {
  destructive("modal de desativação mostra impacto e exige confirmação", async (page) => {
    await page.goto("/agent/editor")

    // Seleciona um agente NÃO padrão. O default ("main") não pode ser desativado.
    const sidebar = page.getByRole("button", { name: /Mais ações para/ })
    const nonDefault = sidebar
      .nth(1)
      .or(page.getByText(/Maya|Leo|Sofia/i).first())
    await nonDefault.click()

    const moreButton = page.getByRole("button", { name: /^Mais$/ })
    await moreButton.click()
    const desativar = page.getByRole("menuitem", { name: /Desativar atendimento/ })
    await desativar.click()

    // Modal deve aparecer
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/conversa|atendimento/i)).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: /Desativar mesmo assim/ }),
    ).toBeVisible()

    // Cancela para não alterar estado
    await dialog.getByRole("button", { name: /Cancelar/ }).click()
    await expect(dialog).toBeHidden()
  })
})
