---
name: whatsapp-contact-profile
description: Lê e atualiza o perfil estendido do contato no WhatsApp (nome formal, segmento, último pedido, observações de atendimento) pra que a próxima conversa não comece do zero.
visibility: atendimento
---

# Skill: WhatsApp — Perfil do Contato

## Objetivo

Manter no `workspace/memory/contatos/<numero>.md` um resumo curto de quem é
a pessoa que tá falando: nome formal, como ela gosta de ser chamada,
segmento dela (loja, clínica, etc), histórico recente de interações,
preferências (canal favorito, horário OK, idioma), e observações que o
atendente humano pediu pra anotar.

A skill é referenciada pelos templates `atendente-loja`, `atendente-clinica`,
`atendente-restaurante` e `atendente-servicos` em
`web/frontend/src/components/agent/templates/catalog.ts` — todo agente que
recebe cliente no WhatsApp tem essa skill ativa.

## Quando usar

- A pessoa identificou-se ou disse o nome ("Sou a Ana de Curitiba").
- Voltou um cliente conhecido pra continuar uma conversa.
- O dono ou o atendente humano pediu pra "anotar isso no perfil dela".
- Algum sinal claro de preferência apareceu ("prefere PIX", "fala inglês",
  "tem alergia a glúten").

## Processo

1. Identificar o número do contato (vem do canal automaticamente como
   `+5511...` ou `whatsapp:5511...`).
2. Ler `workspace/memory/contatos/<numero>.md` se existir.
3. Mesclar a nova informação no arquivo, **sem apagar** o que já estava
   lá. Se houver conflito de fato (ex: nome mudou), preserve o histórico:
   `Nome anterior: Maria | Nome atual: Maria Silva (corrigido em 2026-05-21)`.
4. Salvar o arquivo. Se for o primeiro contato, criar com seções: Nome,
   Como chamar, Segmento, Histórico, Preferências, Observações.

## O que NÃO fazer

- Não armazene dados sensíveis (CPF, cartão, senha) — esses ficam em
  outros sistemas, não no perfil do contato.
- Não escreva opinião sobre o cliente ("chato", "burro"). O perfil é
  factual.
- Não sobreescreva sem ler primeiro — você apaga histórico.

## Status

**Stub minimal** — esta SKILL.md existe para satisfazer o teste
`TestTemplateCatalogRecommendedSkillsExist` que valida que toda skill
referenciada em `recommended_skills` dos templates existe no
`workspace/skills/`. Conteúdo completo (scripts, exemplos) será
desenvolvido conforme a feature de perfil de contato for priorizada.
