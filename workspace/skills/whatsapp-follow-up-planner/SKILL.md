---
name: whatsapp-follow-up-planner
description: Planeja e agenda follow-ups proativos para leads, clientes e atendimentos abertos no WhatsApp, respeitando horário comercial, rate-limits e consentimento LGPD.
visibility: comercial
---

# Skill: WhatsApp Follow-up Planner

## Objetivo
Estruturar follow-ups de forma organizada, sem spammar o cliente.

## Quando usar
- Lead quente sem resposta há mais de 24h.
- Atendimento aberto sem resolução há mais de 48h.
- Proposta enviada sem retorno há mais de 72h.
- Agendamento confirmado (lembrete D-1 e D-0).

## Regras de rate-limit

- Máximo 1 follow-up por assunto a cada 24h.
- Máximo 3 follow-ups totais por lead não convertido (depois, encaminhar para Sofia ou arquivar).
- Nunca enviar fora do horário comercial configurado em `config/company-profile.md`.
- Sempre verificar consentimento com `whatsapp-lgpd-consent` antes de enviar.

## Processo

1. Ler estado em `memory/crm/follow-ups.json`.
2. Verificar consent.
3. Verificar rate-limit (último envio < 24h → não enviar).
4. Compor mensagem curta e objetiva.
5. Agendar envio no próximo horário comercial disponível.
6. Atualizar `memory/crm/follow-ups.json` com próxima tentativa.

## Templates de mensagem

Lead quente sem resposta:
> "Oi [Nome], tudo bem? Vi que você tinha interesse em [serviço/produto]. Posso te ajudar a dar o próximo passo?"

Proposta sem retorno:
> "Oi [Nome], você teve chance de ver a proposta? Fico à disposição se tiver dúvidas."

Lembrete de agendamento (D-1):
> "[Nome], lembrete: você tem [tipo] amanhã às [hora]. Confirma?"

Lembrete de agendamento (D-0, 2h antes):
> "[Nome], sua [tipo] é hoje às [hora]. Até logo."

## Regras

- Mensagens curtas — máximo 2 linhas.
- Não enviar se o cliente demonstrou desinteresse.
- Após 3 tentativas sem resposta: encaminhar para handoff-human ou arquivar lead.

## Saída esperada

```yaml
follow_up_agendado: sim | nao
motivo_bloqueio: rate_limit | sem_consent | horario_invalido | max_tentativas | nenhum
proxima_tentativa: ISO8601 | null
template_usado: ""
```
