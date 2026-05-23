# HEARTBEAT

Rotina proativa periódica do agente principal do tenant. O serviço de
heartbeat (ver `pkg/heartbeat/`) lê este arquivo a cada ~10 min e pede
ao agente que execute as verificações. Edite para o contexto do tenant.

## Rotina padrão

A cada batida, o agente principal deve checar:

1. Atendimentos parados há > 2h.
2. Mensagens não respondidas há > 30 min.
3. Leads quentes sem follow-up no mesmo dia.
4. Cobranças / vencimentos próximos (próximos 3 dias).
5. Quota de uso (LiteLLM, disco) acima de 80%.

Se não há nada que mereça atenção, responder apenas:

HEARTBEAT_OK

## Como alertar (chat vs painel de Notificações)

### Painel de Notificações (default)

Use a tool `notify_user` para informação assíncrona — aparece no rodapé
do sidebar do operador, sem interromper o chat. Boa para resumos,
avisos suaves e cobranças.

Schema: `notify_user(kind, title, body, agent_id, cta_url?, cta_label?)`
onde `kind` é `data` / `warning` / `billing`.

Exemplos:

```
notify_user(
  kind="warning",
  title="3 atendimentos parados há > 2h",
  body="Veja a fila no painel.",
  agent_id="main",
  cta_url="/pendencias"
)
```

```
notify_user(
  kind="data",
  title="12 leads novos hoje",
  body="Maior origem: WhatsApp orgânico.",
  agent_id="main"
)
```

```
notify_user(
  kind="billing",
  title="Quota LiteLLM em 82%",
  body="Restam ~18% do mês. Em ritmo normal, deve durar 6 dias.",
  agent_id="main"
)
```

### Mensagem no chat (apenas urgente)

Apenas para situações que precisam de decisão imediata do operador OU
exigem resposta dele. Exemplos:

- Cliente pedindo cancelamento de contrato.
- Risco jurídico iminente.
- Falha técnica bloqueando vendas.

Formato sugerido:

```
Assunto: [curto]
Resumo: [3-4 frases]
Por que importa: [motivo objetivo]
Sugestão: [ação recomendada]
Prioridade: [Alta]
```

Regra de bolso: **se o operador não precisa responder, é
`notify_user`. Se ele precisa decidir agora, é mensagem no chat.**

## Rate-limit

Para não sobrecarregar o operador:

- Máximo 3 alertas por ciclo (chat + painel combinados), priorizando
  Alta > Média > Baixa.
- Máximo 1 alerta por tópico a cada 1 hora.
- Mesmo problema já alertado e não resolvido: confirmar antes de
  reenviar.

## Limites

O agente deve sugerir e alertar, mas NÃO executar ações sensíveis sem
autorização (envios em massa, alterações em config, etc.).
