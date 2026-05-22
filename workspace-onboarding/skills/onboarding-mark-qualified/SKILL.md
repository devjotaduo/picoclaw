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

Nenhum argumento obrigatório. O `intake_id` é resolvido a partir de
`$PICOCLAW_CHAT_SESSION_ID`, que o `ExecTool` injeta no ambiente com o
`session_id` da sessão atual do canal publicweb (que o browser configura
igual ao `intake_id` ao abrir o stream).

Para rodar manualmente fora do agente (debug), passe o id explícito:

```
scripts/mark-qualified.sh <intake_id>
```

## Side effects

POST autenticado pra `${PICOCLAW_ONBOARDING_CALLBACK_URL}/api/v1/onboarding-callback`
com payload `{"intake_id":"…","action":"mark_qualified","ts":…}` assinado via
HMAC-SHA256 usando `PICOCLAW_ONBOARDING_CALLBACK_SECRET`.

## Script

```
scripts/mark-qualified.sh
```

Exit 0 = sucesso. Não-zero = falha (ver stderr).
