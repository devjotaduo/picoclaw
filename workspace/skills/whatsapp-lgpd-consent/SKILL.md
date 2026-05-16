---
name: whatsapp-lgpd-consent
description: Controlar consentimento e privacidade no atendimento por WhatsApp. Ativar quando houver coleta, registro, compartilhamento, exclusão, correção, portabilidade ou mascaramento de dados pessoais e sensíveis.
---

# WhatsApp LGPD Consent

## Workflow

1. Antes de pedir dados, confirme a finalidade e se o dado é realmente necessário.
2. Para dados sensíveis, peça consentimento explícito e registre apenas o mínimo.
3. Mascare CPF, cartão, documentos, tokens e dados financeiros em resumos.
4. Se a pessoa pedir exclusão, correção, acesso ou portabilidade, encaminhe ao responsável por privacidade.
5. Em relatórios, use agregados e evite identificação individual.

## Status

- `unknown`: sem consentimento registrado.
- `consented`: contato autorizou uso para a finalidade atual.
- `deletion_requested`: contato pediu exclusão/remoção.
- `restricted`: não usar em relatório ou ação comercial sem revisão.

## Regras

- Nunca prometa que dados foram apagados sem confirmação do responsável.
- Nunca exponha dados de outro cliente para "ajudar" o contato.
- Para incidentes ou vazamento, acione fluxo de segurança imediatamente.
