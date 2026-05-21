---
name: onboarding-mark-qualified
description: Marca este intake como "qualificado" no controlplane Picoclaw SaaS. Use SOMENTE depois que coletou identidade, negócio, dor, e canais — não use no meio da conversa.
version: 1.0.0
language: pt-br
---

# onboarding-mark-qualified

Sinaliza ao controlplane que o visitante completou o roteiro de descoberta.
O controlplane registra `qualified_at` e dispara os nudge emails se a sessão
ficar ociosa.

Idempotente: chamar duas vezes é seguro — o primeiro `qualified_at` é
preservado para fins de analytics.

## Arguments

- `intake_id` (string, required) — id do intake; passe SEMPRE o
  `$INTAKE_ID` que o agente recebeu no contexto inicial da sessão.

## Side effects

POST autenticado pra `${PICOCLAW_ONBOARDING_CALLBACK_URL}/api/v1/onboarding-callback`
com payload `{"intake_id":"…","action":"mark_qualified","ts":…}` assinado via
HMAC-SHA256 usando `PICOCLAW_ONBOARDING_CALLBACK_SECRET`.

## Script

```
scripts/mark-qualified.sh "$INTAKE_ID"
```

Exit 0 = sucesso. Não-zero = falha (ver stderr).
