# Dashboard items

Agentes podem publicar itens no painel criando arquivos `.json` nesta pasta.

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
