---
name: onboarding-mark-qualified
description: Marca este intake como "qualificado" no controlplane Picoclaw SaaS. Use SOMENTE depois que coletou identidade, negócio, dor, e canais — não use no meio da conversa.
version: 0.1.0
language: pt-br
---

# onboarding-mark-qualified

**STATUS: stub.** O script de implementação (`scripts/mark-qualified.sh`) será adicionado na Phase 6 do plano (callback HTTP HMAC pro controlplane).

## Arguments (futuro)

- `intake_id` (string, required) — id do intake (passa `$INTAKE_ID` do contexto inicial).

## Side effects (futuro)

POST autenticado pra `${PICOCLAW_ONBOARDING_CALLBACK_URL}/api/v1/onboarding-callback`
com payload `{"intake_id":"…","action":"mark_qualified","ts":…}` assinado via HMAC-SHA256
usando `PICOCLAW_ONBOARDING_CALLBACK_SECRET`.
