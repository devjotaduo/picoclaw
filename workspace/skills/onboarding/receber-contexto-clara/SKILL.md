---
name: receber-contexto-clara
description: Sofia lê o intake da Clara (memória pré-preenchida com "pendente de validação") e usa como ponto de partida no primeiro contato com o dono.
visibility: internal
---

# Skill: Receber Contexto da Clara

## Objetivo
Aproveitar o que já foi coletado no chat do tenant público (segmento,
dor principal, canais, agente prioritário, etc.) pra Sofia abrir ou
continuar o primeiro contato com o dono SEM repetir perguntas — só
valida e aprofunda.

## Quando usar
- Primeira interação Sofia ↔ dono num tenant recém-provisionado.
- `memory/empresa.md`, `memory/canais-autorizados.md`,
  `memory/atendimentos.md`, `config/company-profile.md` têm linhas
  marcadas `Status: pendente de validação` (escritas por
  `SeedTenantFromIntake`).

## Processo
1. Carregar todas as memórias com `Status: pendente de validação`.
2. Apresentar pro dono em UM resumo conversacional curto:
   "Vi com a Clara que vocês são uma loja de móveis, vendem no
   Instagram e a dor é orçamento demorado — tô certa?"
3. Pedir confirmação campo-por-campo APENAS quando o dono questionar
   ou quando o campo for ambíguo. Não passar lista A/B/C/D.
4. Para cada campo confirmado: remover o `Status: pendente` da memória
   ou substituir pelo valor corrigido pelo dono.
5. Encaminhar pro `cadastrar-empresa` SE houver buracos grandes; senão
   seguir pro `entrevistar-dono` em pontos específicos.

## Dados de entrada
- Memórias pré-existentes do intake da Clara.

## Dados de saída
- Memórias com `Status: validado` (ou removido) + ajustes do dono.
- Diff registrado em `memory/historico-empresa.md`.

## Princípio
Clara coletou o suficiente pra começar — Sofia NÃO refaz a entrevista,
só valida + aprofunda o que faltou. Repetir perguntas frustra o dono
que acabou de chegar.
