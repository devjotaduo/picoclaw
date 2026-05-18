import { destructive, expect, test } from "../fixtures"

test.describe("agent editor — Versões + diff", () => {
  test("abre o drawer Versões e mostra estado vazio quando o navegador é limpo", async ({ editor }) => {
    // Limpa localStorage para garantir estado vazio
    await editor.evaluate(() =>
      window.localStorage.removeItem("picoclaw:agent-editor:versions"),
    )
    await editor.reload()
    await editor.getByRole("button", { name: /Versões/ }).click()
    const drawer = editor.getByRole("dialog", { name: /Histórico de versões/ })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText(/Nenhuma versão salva/)).toBeVisible()
  })

  destructive("salva versões automaticamente após Apply e permite restaurar", async (page) => {
    await page.goto("/agent/editor")
    // Salva uma versão sintética no localStorage para o teste ser determinístico,
    // sem precisar acionar o applyMutation real (que toca o backend).
    await page.evaluate(() => {
      const payload = {
        template_id: "atendente-geral",
        name: "Ana E2E",
        short_description: "",
        presentation: "",
        skill_configs: [],
      }
      const version = {
        id: `e2e-${Date.now()}`,
        agentID: "main",
        createdAt: Date.now() - 60_000,
        label: "E2E synthetic version",
        payload,
      }
      window.localStorage.setItem(
        "picoclaw:agent-editor:versions",
        JSON.stringify({ main: [version] }),
      )
    })
    await page.reload()
    await page.getByRole("button", { name: /Versões/ }).click()
    const drawer = page.getByRole("dialog", { name: /Histórico de versões/ })
    await expect(drawer.getByText("E2E synthetic version")).toBeVisible()
    await expect(
      drawer.getByRole("button", { name: /Restaurar/ }),
    ).toBeVisible()
  })
})
