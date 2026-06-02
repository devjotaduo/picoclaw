# Cenário 15 — Operador: Consulta de Issues GitHub

## Objetivo
Verificar se Operador consulta e apresenta as issues do GitHub de forma clara.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- `github`

## Diálogo (20 turnos)

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

**T05**
🧑 *Ok, encontrou algo?*

🤖 Operador: Encontrei 2 arquivos: `whatsapp/gateway.js` (L87–L103) e `whatsapp/media-handler.js` (L45–L61). Ambos sem tratamento de erro para payload nulo.

---

**T06**
🧑 *Quais as mudanças necessárias?*

🤖 Operador: Em `gateway.js`: adicionar null-check no campo `message.media` antes do parse. Em `media-handler.js`: adicionar try/catch no bloco de download com log de erro.

---

**T07**
🧑 *Faz o draft do PR.*

🤖 Operador: PR draft criado: `fix/null-media-payload`. Inclui os 2 arquivos. Ainda sem aprovação para merge.

---

**T08**
🧑 *Me mostra o diff dos 2 arquivos.*

🤖 Operador: Diff disponível no PR. Resumo: gateway.js +4 linhas (null-check), media-handler.js +7 linhas (try/catch + log). Nenhuma linha removida.

---

**T09**
🧑 *Parece ok. Adiciona testes.*

🤖 Operador: Adicionando testes unitários: 1 teste para payload nulo em gateway e 2 testes para falha de download em media-handler. Total: 3 testes novos.

---

**T10**
🧑 *CI passou?*

🤖 Operador: CI executado: 3 testes novos passando, 0 regressões. Build: verde.

---

**T11**
🧑 *Pode solicitar review para o QA Tester.*

🤖 Operador: Review solicitado para QA Tester. PR permanece como draft até aprovação.

---

**T12**
🧑 *QA aprovou?*

🤖 Operador: Sim. QA Tester aprovou com nota 9,5. Nenhuma falha bloqueante.

---

**T13**
🧑 *Pode fazer o merge.*

🤖 Operador: Merge realizado em `main`. PR fechado. Build de produção iniciado.

---

**T14**
🧑 *Build ok?*

🤖 Operador: Build de produção: sucesso. Deploy realizado em 2 min.

---

**T15**
🧑 *Registra o fix no changelog.*

🤖 Operador: Changelog atualizado: "fix: null media payload handling (gateway + media-handler) — PR #47".

---

**T16**
🧑 *Tem mais issues abertas?*

🤖 Operador: Sim. 2 issues abertas: #49 (timeout em canal Telegram — baixa prioridade) e #51 (performance do relatório mensal — média prioridade).

---

**T17**
🧑 *A #51 é urgente. Prioriza.*

🤖 Operador: Issue #51 atualizada para prioridade alta. Investigação iniciada.

---

**T18**
🧑 *O que encontrou na #51?*

🤖 Operador: Query de relatório sem índice na coluna `created_at`. Em tabela com 500k registros, tempo médio: 8s. Com índice estimado: <200ms.

---

**T19**
🧑 *Cria o índice.*

🤖 Operador: Migration criada: `CREATE INDEX idx_created_at ON atendimentos(created_at)`. Aguarda aprovação para executar em produção.

---

**T20**
🧑 *Aprovado. Executa.*

🤖 Operador: Migration executada. Índice criado. Tempo médio de relatório: 180ms. Issue #51 fechada.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Usou skill `github` | Sim | PASS |
| Apresentou issues de forma estruturada | Sim | PASS |
| Não abriu PR sem confirmação | Sim | PASS |
| Buscou código antes de agir | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,5
- **Observações**: Operador geriu issues com precisão. Buscou código antes de agir, criou PR como draft, aguardou confirmação para merge e manteve changelog atualizado. Referência de boas práticas DevOps para o agente.
