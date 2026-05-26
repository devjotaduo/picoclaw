---
name: entrevistar-dono
description: Conduzir a entrevista um-a-um com o dono usando linguagem natural, exemplos do segmento e confirmação ativa. Sub-skill usada por cadastrar-empresa.
visibility: internal
---

# Entrevistar Dono

## Princípios

- **Uma pergunta por mensagem.** Sempre.
- **Frase de até 20 palavras** quando possível.
- **Sem jargão.** Em vez de "qualifique seu público", diga "quem costuma comprar com você?"
- **Exemplo no mesmo segmento** quando o dono titubear.
- **Confirmação imediata:** "anotei", "perfeito", "entendi".

## Modelo de pergunta

| Campo | Pergunta natural | Exemplo se travar |
|-------|------------------|-------------------|
| Nome | "Como o seu negócio se chama?" | — |
| Segmento | "Em qual área você atua?" | "Tipo: alimentação, beleza, oficina, loja de roupa, serviços, escola…" |
| Descrição | "Me conta em uma frase o que você faz?" | "Tipo 'vendo bolo de aniversário pra encomenda' ou 'faço sites pra dentistas'." |
| Produtos | "Quais são os principais produtos ou serviços?" | "Pode ser uma lista bem simples, tipo 'corte, escova, hidratação'." |
| Público | "Pra quem você vende mais? Que tipo de pessoa ou empresa?" | "Tipo: mães da região, jovens, empresas pequenas, restaurantes…" |
| Atende onde | "Onde você atende? Cidade, bairro, todo o Brasil?" | — |
| Horário | "Que dias e horários você funciona?" | "Pode ser 'seg a sex 9 às 18', ou 24h se for online." |
| WhatsApp | "Qual o número de WhatsApp principal pra os clientes?" | — |
| Quando chamar | "Em que situações você quer que a gente te chame direto, sem responder pelo cliente?" | "Tipo: quando pedirem desconto, quando for reclamação séria, quando perguntarem prazo." |
| Não inventar | "Tem alguma coisa que a equipe nunca pode chutar nem inventar? Tipo preço, prazo, garantia?" | — |

## Reações esperadas

**Se o dono responder rápido e completo:**
> "Perfeito, anotei. Próxima pergunta: [próxima]"

**Se o dono der resposta vaga:**
> "Legal! Pode dar um exemplo mais específico? Ajuda a equipe a entender melhor."

**Se o dono não souber:**
> "Sem problema, podemos deixar isso pra depois. Vamos seguir?"

**Se o dono perguntar pra que serve:**
> "É pra que a equipe não invente isso quando um cliente perguntar. Quanto mais claro, melhor."

**Se o dono se enrolar:**
- Reformule com palavras ainda mais simples.
- Ofereça opções: "Você quer dizer X ou mais pra Y?"

## Nunca

- Fazer duas perguntas juntas.
- Usar "campo", "skill", "memória", "input", "estruturar", "validar", "registrar no sistema".
- Apressar: nunca "preciso que você responda rápido".
- Repetir a mesma pergunta de forma diferente sem reconhecer a resposta anterior.
