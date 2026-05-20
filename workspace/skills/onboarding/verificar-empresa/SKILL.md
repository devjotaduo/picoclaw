---
name: verificar-empresa
description: Verifica se as informações obrigatórias da empresa estão preenchidas antes de iniciar qualquer atendimento externo. BLOQUEADOR — todos os agentes devem executar esta verificação.
---

# Verificar Empresa — BLOQUEADOR DE ONBOARDING

## Objetivo

Antes de qualquer atendimento a clientes externos, verificar se `memory/empresa.md` contém os campos obrigatórios preenchidos.

## Campos obrigatórios

Verifique se os campos abaixo estão presentes e preenchidos (valor não vazio e diferente de "pendente de validação"):

1. **Nome** — nome da empresa
2. **Segmento** — setor de atuação
3. **Descrição** — o que a empresa faz
4. **Produtos ou serviços** — produtos/serviços oferecidos
5. **Horário** — horário de funcionamento
6. **WhatsApp** — número de contato principal
7. **Quando chamar humano** — critérios para escalar para atendente
8. **Informações que nunca podem ser inventadas** — campos críticos que o agente não pode inventar

## Comportamento quando a empresa está INCOMPLETA

**Para atendimento externo (WhatsApp, Telegram, clientes):**

Responda apenas:
> "Olá! Estou passando por uma configuração inicial. Em breve voltarei a atender normalmente. Se precisar de ajuda urgente, entre em contato diretamente com a equipe."

**NÃO:**
- Tente adivinhar ou inventar informações da empresa
- Responda perguntas sobre produtos, preços, horários ou serviços
- Execute nenhum outro fluxo de atendimento

## Comportamento quando a empresa está COMPLETA

Prossiga normalmente com o atendimento.

## Verificação rápida

Leia `memory/empresa.md` e verifique:
- Se o arquivo não existe → BLOQUEADO
- Se `Status da informação: pendente de validação` → BLOQUEADO
- Se todos os campos obrigatórios têm valor → LIBERADO

## Quem usa esta skill

- **Clara** — atendimento ao cliente (OBRIGATÓRIO antes de cada sessão)
- **Marcos** — vendas (OBRIGATÓRIO antes de cotar produtos)
- **Camila** — suporte (OBRIGATÓRIO antes de orientar clientes)
- **Rafael** — gestor (usa para alertar o dono quando empresa está incompleta)
