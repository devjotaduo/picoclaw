---
name: onboarding-submit-intake
description: Submete o intake finalizado (com contact_email e contact_whatsapp) ao controlplane, que então dispara o AutoProvisioner para criar o tenant do cliente.
version: 0.1.0
language: pt-br
---

# onboarding-submit-intake

**STATUS: stub.** Script adicionado em Phase 6 do plano.

## Arguments (futuro)

- `intake_id`, `contact_email`, `contact_whatsapp`.

## Side effects (futuro)

POST `${PICOCLAW_ONBOARDING_CALLBACK_URL}/api/v1/onboarding-callback`
com `{"intake_id":"…","action":"submit_intake","contact_email":"…","contact_whatsapp":"…","ts":…}`.
