---
name: whatsapp-conversation-summary
description: Gerar resumo estruturado de uma conversa de WhatsApp para registro, handoff, CRM ou relatório. Ativar ao encerrar atendimento, antes de transferir para humano, após uma reclamação, orçamento ou quando houver nova próxima ação.
---

# WhatsApp Conversation Summary

## Workflow

1. Leia a conversa recente e identifique intenção, status, dados coletados e pendências.
2. Resuma em até 5 linhas, sem copiar mensagens longas.
3. Liste campos coletados e faltantes.
4. Defina próxima ação concreta e responsável sugerido.
5. Mascare dados pessoais antes de registrar.

## Saída Esperada

```json
{
  "intent": "",
  "priority": "low|medium|high",
  "summary": "",
  "collected_fields": {},
  "missing_fields": [],
  "needs_handoff": false,
  "target_sector": "",
  "next_action": ""
}
```

## Regras

- Um bom resumo evita que o cliente repita tudo.
- Se não houver próxima ação clara, a próxima ação é coletar o campo faltante mais importante.
- Para transferência, acione `human-handoff-brief`.
