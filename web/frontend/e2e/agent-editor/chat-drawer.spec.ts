import { expect, test } from "../fixtures"

test.describe("agent editor — chat drawer", () => {
  test("abre o drawer pelo botão do header", async ({ editor }) => {
    await editor.getByRole("button", { name: /Chat de teste/ }).click()
    const drawer = editor.getByRole("complementary", {
      name: /Chat de teste/,
    })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole("heading", { name: /Chat de teste/ })).toBeVisible()
  })

  test("alterna a largura do drawer", async ({ editor }) => {
    await editor.getByRole("button", { name: /Chat de teste/ }).click()
    const drawer = editor.getByRole("complementary", { name: /Chat de teste/ })
    const widthToggle = drawer.getByRole("button", {
      name: /Mudar largura do drawer/,
    })
    const before = await widthToggle.innerText()
    await widthToggle.click()
    const after = await widthToggle.innerText()
    expect(after).not.toBe(before)
  })

  test("Esc fecha o drawer", async ({ editor }) => {
    await editor.getByRole("button", { name: /Chat de teste/ }).click()
    await expect(
      editor.getByRole("complementary", { name: /Chat de teste/ }),
    ).toBeVisible()
    await editor.keyboard.press("Escape")
    await expect(
      editor.getByRole("complementary", { name: /Chat de teste/ }),
    ).toBeHidden()
  })
})
