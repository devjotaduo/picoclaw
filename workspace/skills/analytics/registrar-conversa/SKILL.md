---
name: registrar-conversa
description: Explica o que é registrado no ledger analítico e como acessar os logs estruturados.
agents:
  - rafael
  - lia
---

# Skill: Registrar Conversa

## O que é registrado

Ao fim de cada turno do agente, o sistema registra automaticamente:

- Sessão, canal, chat, remetente, agente
- Direção (inbound/outbound)
- Duração do turno em ms
- Tags CSV: question, complaint, purchase, support, greeting, media
- Indicador de mídia (foto, áudio, documento)

## Onde fica

```
workspace/output/analytics/YYYY-MM-DD.jsonl
```

Cada linha é um JSON completo (MessageRecord).

## LGPD

SenderID = número WhatsApp → dado pessoal. Retenção máxima: 24 meses.
Não compartilhar com terceiros sem consentimento.

## Como ler

```bash
cat workspace/output/analytics/2026-05-20.jsonl | jq .
```
