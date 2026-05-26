# Cenário 16 — Operador: Criar Nova Skill

## Objetivo
Verificar se Operador usa `skill-creator` corretamente para criar uma nova skill a partir da descrição do dono.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- `skill-creator`

## Diálogo (8 turnos)

---
**T01**
🧑 *@operador criar skill: quero uma skill para qualificar leads de academias de ginástica.*

🤖 Operador: Invocando `skill-creator`. Vou criar um rascunho da skill `lead-qualification-academia` com as etapas de qualificação específicas para o segmento fitness. Um momento.

---
**T02**
🤖 Operador: Rascunho pronto. Antes de gravar, aqui está a estrutura:

```
nome: lead-qualification-academia
objetivo: qualificar leads de academias de ginástica
etapas:
  1. Identificar tipo (academia, estúdio, crossfit, personal)
  2. Verificar número de alunos ativos
  3. Descobrir dor principal (retenção, captação, gestão)
  4. Verificar orçamento mensal
  5. Verificar decisor
  6. Classificar como quente/morno/frio
```
Posso gravar em `workspace/skills/vendas/lead-qualification-academia/SKILL.md`?

---
**T03**
🧑 *Adiciona também uma etapa para verificar se já usa algum sistema.*

🤖 Operador: Adicionado. Etapa 3b: "Verificar sistemas atuais (software de gestão, planilha, nenhum)". Confirma para gravar?

---
**T04**
🧑 *Confirma.*

🤖 Operador: Skill gravada em `workspace/skills/vendas/lead-qualification-academia/SKILL.md`.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Mostrou rascunho antes de gravar | Sim | |
| Incorporou feedback do dono | Sim | |
| Só gravou após confirmação explícita | Sim | |
| Caminho de gravação correto | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
