# Dashboard items

Agentes podem publicar itens no painel criando arquivos `.json` nesta pasta.

O painel do tenant promovido (`/agent/dashboard`) tambem agrega entregas
geradas fora desta pasta. Use `workspace/dashboard/items/*.json` quando o
agente precisa pedir decisao humana explicita. Use `workspace/output/*`
quando o agente esta publicando relatorio, plano, dado estruturado ou
arquivo gerado.

Contrato minimo:

```json
{
  "id": "rafael-alerta-2026-05-20",
  "type": "suggestion",
  "status": "pending",
  "title": "Atendimentos parados no fim do dia",
  "summary": "Rafael recomenda revisar conversas sem resposta antes do encerramento.",
  "agent_id": "rafael",
  "agent_name": "Rafael",
  "priority": "high",
  "created_at": "2026-05-20T18:00:00Z",
  "updated_at": "2026-05-20T18:00:00Z",
  "tags": ["atendimento", "alerta"],
  "artifacts": [
    {
      "type": "site",
      "title": "Página da campanha",
      "url": "https://exemplo.com/campanha"
    }
  ]
}
```

Tipos aceitos: `result`, `analysis`, `suggestion`, `report`, `metric`, `task`.

Status aceitos: `new`, `pending`, `in_progress`, `scheduled`,
`implemented`, `done`, `dismissed`.

Entregáveis aceitos em `artifacts`: `image`, `document`, `site`, `link`,
`service` ou `file`.

Respostas do usuário salvas pelo painel ficam em
`workspace/dashboard/responses/*.json`.

## Fontes agregadas pelo painel

| Caminho | Como aparece |
|---|---|
| `workspace/dashboard/items/*.json` | Fila de atencao e itens por agente |
| `workspace/output/reports` | Relatorios |
| `workspace/output/plans` | Planos e proximas acoes |
| `workspace/output/data` | Dados/metricas |
| `workspace/output/analytics` | Analises operacionais |
| `workspace/tests/relatorios` | Relatorios de teste/QA |
| `workspace/cron/jobs.json` | Tarefas e rotinas agendadas |
| `workspace/output/**` | Arquivos e links no drawer do agente |

Formatos lidos em `workspace/output` e `workspace/tests/relatorios`:
`.md`, `.txt`, `.json`, `.jsonl` e `.csv`.

## Metadados recomendados

Arquivos gerados podem incluir campos simples para melhorar o agrupamento
por agente. Em Markdown, use pares `Campo: valor` no inicio do arquivo. Em
JSON/JSONL, use os mesmos nomes como chaves.

Campos uteis:

- `id`
- `titulo` ou `title`
- `resumo` ou `summary`
- `agente`, `agent`, `agent_id` ou `agent_name`
- `responsavel`
- `status`
- `prioridade` ou `priority`
- `data`, `created_at` ou `updated_at`
- `tags`

Exemplo Markdown:

```md
Titulo: Plano semanal de campanhas
Agente: Lia
Status: pending
Prioridade: medium
Data: 2026-05-29T09:00:00Z

Resumo do plano e proximas acoes.
```

Exemplo JSON:

```json
{
  "id": "lia-plano-semanal-2026-05-29",
  "title": "Plano semanal de campanhas",
  "summary": "Lia recomenda tres campanhas para a semana.",
  "agent_id": "lia",
  "agent_name": "Lia",
  "status": "pending",
  "priority": "medium",
  "updated_at": "2026-05-29T09:00:00Z"
}
```

## Como a UI usa esses dados

A tela `Painel dos agentes` tem cinco abas:

- `Geral`: resumo do tenant, KPIs, agentes, fila e WhatsApp.
- `Agentes`: lista operacional por responsavel e drawer de detalhe.
- `Fila`: itens com status acionavel (`new`, `pending`, `in_progress`,
  `scheduled`).
- `Relatórios`: relatorios, dados, planos e arquivos.
- `Operação`: prontidao das fontes e filtros atuais.

Filtros globais:

- busca textual;
- agente;
- status (`todos`, `precisa acao`, `concluidos`, `sem dados`);
- origem (`WhatsApp`, `Arquivos gerados`, `Relatorios`, `Planos`,
  `Rotinas`, `Testes`).

Para o agente aparecer corretamente:

1. Prefira preencher `agent_id` e `agent_name`.
2. Se o arquivo nao tiver metadados, o painel tenta inferir pelo caminho,
   titulo e aliases conhecidos (`sofia`, `catarina`, `lia`, `marcos`,
   `camila`, `clara`, `rafael`, `qa`).
3. Para itens que exigem resposta humana, use status acionavel e publique
   em `workspace/dashboard/items/*.json`.
