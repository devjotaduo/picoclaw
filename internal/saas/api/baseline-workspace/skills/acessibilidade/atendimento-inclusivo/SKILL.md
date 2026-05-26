---
name: atendimento-inclusivo
description: Orienta agentes a atenderem com acessibilidade: mensagens de áudio, imagens, baixa alfabetização, idosos, emergências e linguagem inclusiva.
visibility: atendimento
---

# Skill: Atendimento Inclusivo

## Objetivo
Garantir que todos os clientes recebam atendimento de qualidade independente de como se comunicam.

## Quando usar
- Cliente enviar áudio no lugar de texto.
- Cliente enviar imagem ou foto de documento.
- Cliente usar linguagem muito simples, com muitos erros ou frases curtíssimas.
- Cliente demonstrar dificuldade para entender respostas (pedir para repetir, responder fora do contexto).
- Emergência ou situação de crise emocional.

---

## Situação 1 — Mensagem de áudio

O agente **não transcreve áudio automaticamente**.

**Se receber áudio:**
> "Recebi sua mensagem de áudio. Para agilizar o atendimento, você consegue me escrever o que precisa? Pode ser de forma resumida."

Se o cliente não conseguir digitar (idoso, deficiência):
> "Sem problema. Pode me mandar outro áudio se preferir, mas me conta: é sobre [assunto que o contexto sugere]?"

**Nunca:** ignorar o áudio sem responder.

---

## Situação 2 — Imagem ou foto de documento

**Se receber imagem:**
1. Confirmar se a imagem contém dado pessoal (CPF, RG, comprovante).
2. Se contiver: usar skill `detectar-pii` antes de qualquer ação.
3. Confirmar finalidade antes de qualquer ação:
   > "Recebi sua imagem. Para usar esse documento, preciso confirmar: é para [finalidade do atendimento]?"
4. Nunca reenviar imagem com dado pessoal em grupo.

---

## Situação 3 — Cliente com baixa alfabetização ou mensagem simples

**Sinais:** erros ortográficos frequentes, frases curtíssimas ("oi", "quero", "tá"), vocabulário reduzido.

**Adaptar:**
- Usar frases ainda mais curtas (máximo 10 palavras por linha).
- Fazer uma pergunta por vez — nunca listar opções longas.
- Não usar termos técnicos ("proposta comercial", "orçamento personalizado" → simplificar para "preço").
- Tom paciente, sem parecer condescendente.

Exemplo: em vez de *"Para dar continuidade ao seu atendimento, preciso coletar algumas informações"*, usar: *"Pode me contar o que precisa?"*

---

## Situação 4 — Cliente idoso ou ritmo lento

**Sinais:** demora nas respostas, perguntas repetidas, textos longos com detalhes desnecessários.

**Adaptar:**
- Nunca apressar ("você pode responder quando quiser").
- Resumir sem cortar — confirmar entendimento.
- Se o cliente perguntar a mesma coisa duas vezes: responder normalmente, sem indicar que já respondeu.
- Chamar Atendimento Humano se houver confusão persistente.

---

## Situação 5 — Emergência ou crise emocional

**Sinais:** menção a acidente, doença grave, perda, crise de saúde mental, ameaça ou desespero.

**Ação imediata:**
1. Não tentar resolver o problema comercial.
2. Responder com calma e empatia:
   > "Entendi que está passando por um momento difícil. Vou chamar alguém da equipe para falar com você agora."
3. Chamar Atendimento Humano imediatamente.
4. Se houver risco imediato de vida:
   > "Se precisar de ajuda urgente, o CVV atende 24h pelo telefone 188 ou no site cvv.org.br."

**Nunca:** continuar o fluxo comercial em situação de crise emocional.

---

## Situação 6 — Linguagem inclusiva

- Tratar cliente pelo nome, sem assumir gênero pelo nome.
- Se o cliente usar pronome neutro (elu, delu, nelu): adotar o mesmo sem comentar.
- Não usar "querida/querido", "minha senhora", "meu senhor" sem contexto claro.
- Nunca fazer piada ou comentário sobre forma de escrever do cliente.

---

## Regras gerais
- Jamais ignorar mensagem de áudio ou imagem sem responder.
- Nunca corrigir ortografia do cliente diretamente.
- Nunca demonstrar impaciência com cliente que demora ou pergunta de novo.
- Sempre chamar Atendimento Humano em crise emocional.

## Saída esperada
```yaml
tipo_situacao: audio | imagem | baixa_alfabetizacao | idoso | emergencia | linguagem_inclusiva
acao_tomada: ""
precisa_humano: sim | não
```
