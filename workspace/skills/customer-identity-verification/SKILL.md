---
name: customer-identity-verification
description: Confirmar a identidade do cliente antes de mostrar dados de pedido, alterar endereço, aceitar pedido de cancelamento, processar devolução ou expor qualquer informação pessoal cadastrada. Ativar antes de qualquer ação que exponha ou modifique dados do cliente. Usar combinação de nome + um identificador (nº do pedido, email parcial, CPF parcial) — nunca apenas nome.
version: 1.0.0
language: pt-br
---

# Customer Identity Verification

## Princípios

- Nome solto **não** é identificação. Sempre combinar com outro dado.
- Pedir o mínimo necessário. Email parcial + nº do pedido geralmente basta.
- Em caso de dúvida, encaminhar à equipe — nunca arriscar.
- Suspeita de fraude (várias tentativas, dados inconsistentes) → bloquear e escalar.

## Combinações aceitas

- Nome completo + número do pedido (recente)
- Nome + CPF parcial (últimos 3 dígitos)
- Nome + email cadastrado (parcial confirmado pelo cliente)
- Nome + telefone cadastrado + pedido recente

Para ações de **alto impacto** (troca de cartão cadastrado, mudança de endereço de entrega de pedido já postado, cancelamento de assinatura), exigir uma combinação extra OU encaminhar à equipe.

## Workflow

1. Identificar a ação que requer verificação.
2. Pedir uma combinação válida (não pedir tudo de uma vez — pedir um por vez).
3. Conferir com os dados do sistema:
   - **Tudo bate** → prosseguir com a ação.
   - **Algum dado não bate** → pedir gentilmente um identificador alternativo. Se errar de novo, escalar.
4. Para alto impacto, exigir confirmação extra (ex.: código enviado pelo email cadastrado).
5. Registrar a verificação no caso (qual combinação foi usada).

## Exemplos

**Cenário**: "Quero saber o status do meu pedido."
- ✅ "Pode me passar o número do pedido ou seu email cadastrado?" → confirmar com nome → ok, mostrar status.
- ❌ "Pelo seu nome encontrei aqui, pedido #1234..." (sem segundo dado).

**Cenário**: "Quero mudar o endereço de entrega do pedido."
- ✅ Verificar identidade + checar se o pedido já foi postado. Se já foi → "Pedido já postado; vou encaminhar para a logística avaliar se é possível redirecionar."
- ❌ Trocar endereço pelo nome só.

**Cenário**: dados não batem após duas tentativas.
- ✅ "Para sua segurança, não consigo prosseguir por aqui. Vou encaminhar para a equipe responsável validar com outros meios."
- ❌ Insistir até a pessoa "lembrar" — pode ser fraude.

**Cenário**: pessoa pede dados sensíveis de outra pessoa ("é minha mãe, ela não consegue ligar").
- ✅ "Por segurança, só consigo passar dados ao titular ou a alguém com autorização registrada. Posso te orientar como cadastrar autorização?"
- ❌ "Tudo bem, pode falar."

## Encaminhamento

Encaminhar à equipe responsável quando:
- Verificação falhar duas vezes com dados diferentes.
- A pessoa pedir informação ou ação em nome de terceiro sem autorização documentada.
- Houver suspeita de fraude (urgência exagerada, tentativa de pular validação, dados parcialmente conhecidos).
- Ação envolver dados sensíveis ou alto impacto que requer aprovação humana.
