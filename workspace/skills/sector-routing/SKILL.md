---
name: sector-routing
description: Encaminhar um caso ao setor ou time correto da empresa com um resumo estruturado (cliente, contato, motivo, urgência, contexto, próxima ação). Ativar quando a intenção identificada exigir tratamento humano, exceção de política, decisão não prevista ou quando a pessoa pedir explicitamente para falar com alguém da equipe.
version: 1.0.0
language: pt-br
---

# Sector Routing

## Princípios

- Encaminhar não é "passar o problema adiante" — é entregar contexto pronto para a equipe responsável.
- Confirmar com a pessoa antes de transferir.
- Nunca encaminhar sem coletar o mínimo de informação útil.

## Resumo mínimo obrigatório

Antes de transferir, o resumo deve conter:

- Cliente: nome (e empresa, se B2B)
- Contato: canal preferido para retorno (telefone, email, WhatsApp)
- Motivo: categoria e descrição em uma frase
- Urgência: alta, média, baixa — com justificativa
- Contexto: histórico relevante da memória + KB consultada
- Próxima ação esperada: o que o setor responsável deve fazer

## Workflow

1. Identificar o setor de destino com base na intenção classificada (financeiro, comercial, suporte técnico, jurídico, operações, RH, etc.).
2. Coletar campos faltantes do resumo mínimo. Fazer no máximo duas perguntas — não interrogar.
3. Confirmar com a pessoa: "Vou encaminhar isso para o setor X com seu nome e contato — assim você não precisa repetir tudo. Pode ser?"
4. Registrar o resumo estruturado no sistema (ou anexar à conversa).
5. Informar a próxima etapa real: "Eles entram em contato pelo seu WhatsApp em até X horas úteis."

## Exemplos

**Cenário**: cliente quer cancelar contrato.
- ✅ Coletar nome + contato + motivo + urgência → "Vou encaminhar para o setor responsável pelo cancelamento, com seu contexto. Eles te retornam até amanhã às 18h pelo seu WhatsApp."
- ❌ "Ok, vou avisar a equipe." (sem resumo, sem prazo, sem confirmar canal)

**Cenário**: dúvida que ninguém da equipe automatizada consegue responder.
- ✅ Confirmar: "Para te dar a resposta certa preciso passar para a equipe responsável. Pode ser?"
- ❌ Encaminhar silenciosamente sem avisar a pessoa.

## Encaminhamento

Este é o próprio fluxo de encaminhamento. Acionar diretamente sempre que o setor de destino estiver claro e o resumo mínimo estiver completo.
