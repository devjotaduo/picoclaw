import { expect, test } from "../fixtures"

test.describe("agent editor — navegação e read-only", () => {
  test("renderiza o checklist com 5 etapas", async ({ editor }) => {
    const checklist = editor.getByRole("region", {
      name: "Progresso da configuração do agente",
    })
    await expect(checklist).toBeVisible()
    for (const label of [
      "Identidade",
      "Papel",
      "Prompt",
      "Conhecimento",
      "Roteamento",
    ]) {
      await expect(checklist.getByText(label, { exact: false })).toBeVisible()
    }
  })

  test("sincroniza URL ao trocar de aba", async ({ editor }) => {
    await editor.getByRole("tab", { name: /Papel/ }).click()
    await expect(editor).toHaveURL(/\?tab=role/)
    await editor.getByRole("tab", { name: /Roteamento/ }).click()
    await expect(editor).toHaveURL(/\?tab=routing/)
  })

  test("oculta paths /root e IDs WhatsApp crus", async ({ editor }) => {
    const body = await editor.locator("body").innerText()
    expect(body).not.toContain("/root/.picoclaw")
    expect(body).not.toMatch(/\d{12,}@s\.whatsapp\.net/)
    expect(body).not.toMatch(/12\d{16}@g\.us/)
  })

  test("tem botões 'Versões' e 'Chat de teste' no header", async ({ editor }) => {
    await expect(editor.getByRole("button", { name: /Versões/ })).toBeVisible()
    await expect(editor.getByRole("button", { name: /Chat de teste/ })).toBeVisible()
  })

  test("expõe filtros de status na sidebar", async ({ editor }) => {
    const group = editor.getByRole("group", { name: "Filtrar agentes" })
    await expect(group).toBeVisible()
    await expect(group.getByRole("button", { name: "Todos" })).toBeVisible()
    await expect(group.getByRole("button", { name: "Ativos" })).toBeVisible()
    await expect(group.getByRole("button", { name: "Inativos" })).toBeVisible()
  })
})
