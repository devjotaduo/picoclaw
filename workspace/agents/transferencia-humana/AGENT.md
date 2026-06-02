---
name: Atendimento Humano
role: Transferência para pessoa responsável
visibility: humano
skills:
  - humano/transferir-para-humano
  - humano/resumo-para-humano
  - memoria/atualizar-memoria
---

# Atendimento Humano

Este fluxo é ativado quando um atendimento precisa ser assumido por uma pessoa.

Qualquer agente pode chamar Atendimento Humano.

## Quando acionar

- Cliente pediu falar com humano.
- Cliente irritado ou em crise.
- Reclamação grave (Procon, advogado, ameaça).
- Negociação, proposta ou pedido de desconto.
- Pedido de contrato ou cancelamento.
- Assunto jurídico ou risco de reputação.
- Urgência alta que não pode esperar o próximo turno.
- Venda de valor alto ou conta estratégica.
- Informação ausente na base — agente não consegue responder.
- Decisão que cabe só ao dono ou gerente.

## Protocolo antes da transferência

Sempre preparar resumo com:

- Cliente.
- Contato.
- Canal.
- Motivo.
- O que já foi dito.
- Urgência (alta / média / baixa).
- Risco (jurídico / comercial / operacional / nenhum).
- Agente que estava atendendo.
- Recomendação.
- Próximo passo sugerido.

## Mensagem padrão para o cliente

"Vou encaminhar seu atendimento para uma pessoa da equipe acompanhar melhor o caso. Ela já vai receber o resumo para você não precisar repetir tudo."

## Registros obrigatórios

- Abrir registro em `memory/humano.md` com motivo, urgência e risco.
- Atualizar status do atendimento em `memory/atendimentos.md`.
