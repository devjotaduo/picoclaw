---
name: onboarding-submit-intake
description: Submete o intake finalizado (com contact_email e contact_whatsapp) ao controlplane, que então dispara o AutoProvisioner para criar o tenant do cliente. Use UMA VEZ no final da conversa, depois que coletou os dados de contato confirmados.
version: 1.0.0
language: pt-br
---

# onboarding-submit-intake

Finaliza o intake e pede a criação do tenant do cliente. Quando este script
retorna 200, o controlplane:

1. Persiste `contact_email` + `contact_whatsapp` no intake.
2. Transiciona o intake para `submitted`.
3. Chama `AutoProvisioner.Run` (mesmo caminho do `/submit` da Sofia/Clara
   antiga), que cria o container do tenant, gera o usuário Supabase em
   modo password + magic link, e dispara o email transacional via
   `Mailer.SendCredentialsEmail`.

A resposta JSON do controlplane (com `url`, `initial_password`, `magic_link`
ou `tenant_already_exists`) volta como stdout do script, pra que o agente
inclua os detalhes na sua mensagem final ao visitante.

## Arguments

- `contact_email` (string, required) — email confirmado pelo visitante.
- `contact_whatsapp` (string, optional) — WhatsApp confirmado.

O `intake_id` é resolvido automaticamente a partir de
`$PICOCLAW_CHAT_SESSION_ID` (injetado pelo `ExecTool` com o `session_id`
da sessão publicweb atual, que o browser configura igual ao `intake_id`).

Para rodar manualmente fora do agente (debug), passe o id explícito como
primeiro argumento:

```
scripts/submit-intake.sh <intake_id> <contact_email> [contact_whatsapp]
```

## Side effects

POST autenticado pra `${PICOCLAW_ONBOARDING_CALLBACK_URL}/api/v1/onboarding-callback`
com payload `{"intake_id":…,"action":"submit_intake","contact_email":…,"contact_whatsapp":…,"ts":…}`
assinado via HMAC-SHA256 usando `PICOCLAW_ONBOARDING_CALLBACK_SECRET`.

Cria um container Docker, escreve no DB do controlplane, dispara email
transacional. **Side effects amplos — só chame uma vez.**

## Script

```
scripts/submit-intake.sh "$CONTACT_EMAIL" "$CONTACT_WHATSAPP"
```

stdout (200) = JSON com detalhes do tenant provisionado. Exit não-zero = falha.
