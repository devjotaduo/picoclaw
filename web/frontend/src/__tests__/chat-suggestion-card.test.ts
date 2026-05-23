import { describe, expect, it } from "vitest"

import {
  groupChatSuggestionMessages,
  parseChatSuggestionCard,
} from "@/lib/chat-suggestion-card"

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

  it("extracts compact option prompts from the assistant follow-up format", () => {
    const parsed = parseChatSuggestionCard(`
- 3 opções mais chiques - 3 mais populares - 3 para moda feminina - 3 para moda masculina - 3 para streetwear ou fitness
`)

    expect(parsed?.title).toBe("Qual opção você quer seguir?")
    expect(parsed?.options).toEqual([
      { title: "3 opções mais chiques", description: "" },
      { title: "3 mais populares", description: "" },
      { title: "3 para moda feminina", description: "" },
      { title: "3 para moda masculina", description: "" },
    ])
  })

  it("extracts nested-looking option prompts from one markdown list item", () => {
    const parsed = parseChatSuggestionCard(`
- 3 opções mais chiques
  - 3 mais populares
  - 3 para moda feminina
  - 3 para moda masculina
  - 3 para streetwear ou fitness
`)

    expect(parsed?.options.map((option) => option.title)).toEqual([
      "3 opções mais chiques",
      "3 mais populares",
      "3 para moda feminina",
      "3 para moda masculina",
    ])
  })

  it("extracts long plain choice lists without an explicit cue", () => {
    const parsed = parseChatSuggestionCard(`
- Coral
- Vermelho
- Bordô
- Rosa-claro
- Pink
- Roxo
- Lilás
`)

    expect(parsed?.title).toBe("Escolha uma opção")
    expect(parsed?.options).toEqual([
      { title: "Coral", description: "" },
      { title: "Vermelho", description: "" },
      { title: "Bordô", description: "" },
      { title: "Rosa-claro", description: "" },
    ])
  })

  it("extracts short titled choice lists", () => {
    const parsed = parseChatSuggestionCard(`
Cores:
- Coral
- Vermelho
- Bordô
- Rosa-claro
`)

    expect(parsed?.title).toBe("Cores:")
    expect(parsed?.options.map((option) => option.title)).toEqual([
      "Coral",
      "Vermelho",
      "Bordô",
      "Rosa-claro",
    ])
  })

  it("keeps long sentence lists as markdown when there is no cue", () => {
    const parsed = parseChatSuggestionCard(`
- Cliente pediu uma revisão completa do atendimento antes da publicação.
- Pedido ainda depende de confirmação do responsável financeiro.
- Canal está pausado até a empresa concluir a configuração.
- Relatório precisa ser validado antes do envio externo.
`)

    expect(parsed).toBeNull()
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

describe("groupChatSuggestionMessages", () => {
  it("groups separate assistant option messages into one suggestion card input", () => {
    const grouped = groupChatSuggestionMessages([
      {
        id: "intro",
        role: "assistant",
        content: "Aqui vão algumas opções do que eu posso fazer por você:",
      },
      {
        id: "one",
        role: "assistant",
        content: "1. Escrever mensagens de atendimento no WhatsApp.",
      },
      {
        id: "two",
        role: "assistant",
        content: "2. Criar fluxos para vendas, suporte ou triagem.",
      },
      {
        id: "user",
        role: "user",
        content: "Quero a segunda.",
      },
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped[0].id).toBe("intro-suggestions")
    expect(parseChatSuggestionCard(grouped[0].content)?.options).toHaveLength(2)
    expect(grouped[1].id).toBe("user")
  })
})
