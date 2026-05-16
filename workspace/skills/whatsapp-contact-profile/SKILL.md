---
name: whatsapp-contact-profile
description: Extrair e atualizar o perfil operacional de um contato do WhatsApp — nome, telefone, cidade, empresa, interesse, preferências, tags, resumo, prioridade e próxima ação. Ativar quando uma conversa revelar dados cadastrais, contexto comercial ou informações úteis para atendimento futuro.
---

# WhatsApp Contact Profile

## Workflow

1. Leia o histórico recente antes de atualizar qualquer campo.
2. Extraia somente dados afirmados pelo contato ou confirmados pela equipe.
3. Atualize: nome, cidade, empresa, interesse, preferências, tags, resumo, prioridade e próxima ação.
4. Use tags curtas e estáveis: `orcamento`, `reclamacao`, `lead-qualificado`, `entrega`, `financeiro`, `lgpd`.
5. Nunca salve CPF completo, cartão, senha, token ou documento completo no resumo.

## Saída Esperada

```json
{
  "name": "",
  "city": "",
  "company": "",
  "interest": "",
  "preferences": "",
  "summary": "",
  "priority": "low|medium|high",
  "tags": [],
  "next_action": ""
}
```

## Regras

- Se o dado for incerto, deixe vazio em vez de inferir.
- Se houver conflito com informação antiga, preserve a mais recente e mencione a mudança no resumo.
- Para dados pessoais sensíveis, acione `whatsapp-lgpd-consent`.
