import { destructive, expect, test } from "../fixtures"

test.describe("agent editor — SaveBar dirty tracking (destrutivo)", () => {
  destructive("muda de Sem alterações para Alterações não salvas ao editar perfil", async (page) => {
    await page.goto("/agent/editor")
    const saveBar = page.getByRole("region", { name: "Barra de salvamento" })
    await expect(saveBar.getByText(/Sem alterações|Salvo/)).toBeVisible()

    // Vai para aba identidade, mexe no nome
    await page.getByRole("tab", { name: /Identidade/ }).click()
    const nameInput = page.getByLabel(/Nome exibido/).first()
    const original = (await nameInput.inputValue()) ?? ""
    await nameInput.fill(`${original}-edit`)
    await expect(saveBar.getByText(/Alterações não salvas/)).toBeVisible()

    // Restaura
    await nameInput.fill(original)
  })

  destructive("Ctrl+S dispara o save quando há alterações", async (page) => {
    await page.goto("/agent/editor")
    await page.getByRole("tab", { name: /Identidade/ }).click()
    const nameInput = page.getByLabel(/Nome exibido/).first()
    const original = (await nameInput.inputValue()) ?? ""
    const modified = original.startsWith("e2e-") ? original : `${original}-e2e`
    await nameInput.fill(modified)

    await page.keyboard.press("Control+s")
    const saveBar = page.getByRole("region", { name: "Barra de salvamento" })
    await expect(saveBar.getByText(/Salvando|Salvo/)).toBeVisible({ timeout: 5_000 })

    // Volta ao estado original
    await nameInput.fill(original)
    await page.keyboard.press("Control+s")
  })
})
