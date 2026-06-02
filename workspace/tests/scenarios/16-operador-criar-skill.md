# Cenário 16 — Operador: Criar Nova Skill

## Objetivo
Verificar se Operador usa `skill-creator` corretamente para criar uma nova skill a partir da descrição do dono.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- `skill-creator`

## Diálogo (20 turnos)

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

**T05**
🧑 *Registra também um roteamento no Marcos para usar essa skill.*

🤖 Operador: Regra de roteamento adicionada em `agents/marcos/AGENT.md`: "Se segmento == 'academia', usar `skills/vendas/lead-qualification-academia/SKILL.md`."

---

**T06**
🧑 *Boa. Agora cria uma segunda skill: captura de lead frio para academia.*

🤖 Operador: Rascunho para `skills/vendas/lead-cold-academia/SKILL.md`:

```
Objetivo: reengajar leads frios do segmento academia.
Gatilho: lead sem resposta há mais de 7 dias.
Ação: enviar mensagem de reativação com benefício de curto prazo.
Tom: direto, sem pressão.
```

Confirma ou quer ajustar?

---

**T07**
🧑 *Adiciona: "não usar emoji".*

🤖 Operador: Adicionado campo `restricoes: sem emoji`. Confirma para gravar?

---

**T08**
🧑 *Confirma.*

🤖 Operador: Skill gravada em `workspace/skills/vendas/lead-cold-academia/SKILL.md`.

---

**T09**
🧑 *Adiciona roteamento no Marcos para essa também.*

🤖 Operador: Regra adicionada: "Se lead frio e segmento == 'academia', usar `skills/vendas/lead-cold-academia/SKILL.md`."

---

**T10**
🧑 *Agora manda o QA Tester rodar as duas skills.*

🤖 Operador: QA Tester acionado para simular as skills `lead-qualification-academia` e `lead-cold-academia` com 20 turnos cada.

---

**T11**
🧑 *QA passou?*

🤖 Operador: Resultado: `lead-qualification-academia` nota 9,0 (aprovada). `lead-cold-academia` nota 8,5 (aprovada com 1 melhoria sugerida: incluir CTA específico).

---

**T12**
🧑 *Quero incluir o CTA na lead-cold-academia.*

🤖 Operador: Qual CTA deseja? Exemplo: "Venha conhecer nossos planos com 1 semana grátis."

---

**T13**
🧑 *Usa: "Que tal retomar? Temos uma condição especial esperando por você."*

🤖 Operador: CTA atualizado na skill. Confirma para salvar?

---

**T14**
🧑 *Confirma.*

🤖 Operador: Skill `lead-cold-academia` atualizada com CTA.

---

**T15**
🧑 *Roda o QA de novo.*

🤖 Operador: QA Tester executado novamente. Nota: 9,5. Aprovada para produção.

---

**T16**
🧑 *Perfeito. Ativa as duas skills em produção.*

🤖 Operador: Skills ativadas em produção. Marcos está configurado para usá-las conforme regras de roteamento.

---

**T17**
🧑 *Documenta as duas no STRUCTURE.md.*

🤖 Operador: `STRUCTURE.md` atualizado com as duas novas skills e suas regras de uso.

---

**T18**
🧑 *Boa. Cria um teste de regressão para garantir que o Marcos não usa a skill errada.*

🤖 Operador: Teste de regressão criado: verifica se Marcos usa `lead-qualification-academia` para leads novos e `lead-cold-academia` para leads frios. Arquivo: `tests/scenarios/marcos-roteamento-academia.md`.

---

**T19**
🧑 *Boa iniciativa. Pode encerrar.*

🤖 Operador: Sessão encerrada. 2 skills criadas, 2 regras de roteamento ativas, 1 teste de regressão registrado.

---

**T20**
🧑 *Obrigado, Operador.*

🤖 Operador: Ok.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Mostrou rascunho antes de gravar | Sim | PASS |
| Incorporou feedback do dono | Sim | PASS |
| Só gravou após confirmação explícita | Sim | PASS |
| Caminho de gravação correto | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,5
- **Observações**: Operador criou e refinou skills com processo correto: rascunho → feedback → confirmação → gravação. Processo replicado para segunda skill e QA foi acionado antes da ativação em produção.
