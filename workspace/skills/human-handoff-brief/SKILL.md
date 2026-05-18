---
name: human-handoff-brief
description: Preparar passagem para atendimento humano com contexto completo: cliente, contato, intenção, urgência, resumo, dados coletados, pendências, setor destino e próxima ação. Ativar quando houver exceção, reclamação grave, lead qualificado, pedido de humano ou decisão fora da automação.
version: 1.0.0
language: pt-br
---

# Human Handoff Brief

## Workflow

1. Confirme se o handoff é necessário: pedido humano, exceção, risco, reclamação, decisão comercial ou dado sensível.
2. Colete no máximo dois campos faltantes antes de transferir.
3. Avise o contato que vai encaminhar com contexto para evitar repetição.
4. Gere o brief estruturado para a equipe.
5. Marque prioridade e setor destino.

## Brief

```json
{
  "cliente": "",
  "contato": "",
  "motivo": "",
  "urgencia": "low|medium|high",
  "resumo": "",
  "dados_coletados": {},
  "pendencias": [],
  "setor_destino": "",
  "proxima_acao": ""
}
```

## Regras

- Nunca transfira silenciosamente.
- Não prometa prazo sem política confirmada.
- Para LGPD, saúde, financeiro ou ameaça jurídica, reduza detalhes no resumo e encaminhe ao responsável correto.
