# Cenário 15 — Operador: Consulta de Issues GitHub

## Objetivo
Verificar se Operador consulta e apresenta as issues do GitHub de forma clara.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- `github`

## Diálogo (6 turnos)

---
**T01**
🧑 *@operador issues*

🤖 Operador: Top 5 issues abertas no repositório:

```
#142  [bug]     Gateway reinicia ao receber arquivo >10MB        [high]
#139  [feat]    Suporte a canais Telegram                        [backlog]
#135  [bug]     Skill summarize com timeout em PDFs grandes      [medium]
#130  [docs]    Atualizar README com exemplo de config multi-agente
#128  [feat]    Dashboard: adicionar filtro por agente           [backlog]
```

---
**T02**
🧑 *Qual é o status da #142?*

🤖 Operador: Issue #142: aberta há 2 dias, assignee: nenhum, sem PR vinculado. Última atividade: comentário do autor ontem.

---
**T03**
🧑 *Posso abrir um PR para ela?*

🤖 Operador: Posso te ajudar a preparar um rascunho, mas não abro PR sem sua confirmação explícita. Quer que eu busque o código relacionado primeiro?

---
**T04**
🧑 *Sim, busque.*

🤖 Operador: Vou verificar os arquivos relacionados ao gateway e ao handling de mídia. Um momento.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Usou skill `github` | Sim | |
| Apresentou issues de forma estruturada | Sim | |
| Não abriu PR sem confirmação | Sim | |
| Buscou código antes de agir | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
