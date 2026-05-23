import { describe, expect, it } from "vitest"

import { parseChatSuggestionCard } from "@/lib/chat-suggestion-card"

describe("parseChatSuggestionCard", () => {
  it("extracts a suggestion card from numbered options", () => {
    const parsed = parseChatSuggestionCard(`
Qual melhoria aplicar ao card?

1. Hierarquia visual: Melhorar tipografia e contraste.
2. Estados interativos - Adicionar hover e loading.
3. Acessibilidade: Garantir teclado e foco visivel.
4. Densidade progressiva: Compactar o que for secundario.
5. Outra ideia qualquer
`)

    expect(parsed?.title).toBe("Qual melhoria aplicar ao card?")
    expect(parsed?.options).toHaveLength(4)
    expect(parsed?.options[0]).toEqual({
      title: "Hierarquia visual",
      description: "Melhorar tipografia e contraste.",
    })
  })

  it("uses the next line as description when the option only has a title", () => {
    const parsed = parseChatSuggestionCard(`
Escolha uma opcao:

- Hierarquia visual
Melhorar titulo e acoes principais.
- Acessibilidade
Garantir navegacao por teclado.
`)

    expect(parsed?.options).toEqual([
      {
        title: "Hierarquia visual",
        description: "Melhorar titulo e acoes principais.",
      },
      {
        title: "Acessibilidade",
        description: "Garantir navegacao por teclado.",
      },
    ])
  })

  it("ignores normal bullet lists without a suggestion cue", () => {
    const parsed = parseChatSuggestionCard(`
Resumo do atendimento:
- Cliente pediu prazo.
- Pedido esta pendente.
- Canal esta pausado.
`)

    expect(parsed).toBeNull()
  })
})
