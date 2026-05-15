---
name: returns-and-refunds-policy
description: Conduzir o workflow de troca, devolução ou reembolso respeitando o Código de Defesa do Consumidor (CDC) e a política da loja. Ativar quando o cliente pedir troca, devolução, reembolso, arrependimento de compra ou relatar defeito de produto. Coletar nº do pedido, motivo, evidências e expectativa. Nunca prometer reembolso fora da política — encaminhar à equipe responsável.
---

# Returns and Refunds Policy

## Princípios

- O CDC garante direito de arrependimento em até 7 dias para compras online (a contar do recebimento) — sempre respeitar.
- Defeito de produto: prazo legal de 30 dias (não-duráveis) ou 90 dias (duráveis) para reclamar.
- A política da loja pode ser **mais generosa** que o CDC, nunca menos.
- Não aceitar reembolso/troca fora da política sem aprovação da equipe responsável.

## Campos a coletar

- Número do pedido
- Motivo: arrependimento, defeito, divergência, atraso, outro
- Data de recebimento (para verificar prazo legal)
- Descrição do defeito ou problema, se aplicável
- Evidências: fotos do produto, embalagem, nota fiscal
- Expectativa do cliente: troca pelo mesmo, troca por outro, reembolso, crédito

## Workflow

1. Validar identidade do cliente (`customer-identity-verification`).
2. Coletar os campos acima com no máximo 2-3 perguntas.
3. Verificar política da loja (Company Context / KB):
   - Está dentro do prazo legal? Está dentro da política da loja?
   - O motivo é coberto (arrependimento, defeito, divergência)?
4. Informar à pessoa a opção que se aplica:
   - Dentro do prazo + motivo coberto → abrir solicitação no sistema, enviar instruções (etiqueta de devolução, endereço, prazo).
   - Fora do prazo OU motivo não coberto → "Está fora da nossa política padrão; vou encaminhar para a equipe responsável avaliar se conseguimos uma exceção."
5. Registrar o pedido com todos os campos coletados.
6. Informar prazo realista para resolução conforme política.

## Exemplos

**Cenário**: "Comprei ontem, recebi hoje e não gostei. Quero devolver."
- ✅ "Está dentro do prazo de arrependimento (7 dias). Vou abrir a solicitação. Pode me passar o número do pedido?"
- ❌ "Sinto muito, não fazemos devolução." (viola CDC)

**Cenário**: "Comprei há 60 dias e quero devolver."
- ✅ Verificar política. Se a loja tem prazo de 30 dias para arrependimento, está fora. "Está fora do prazo padrão de arrependimento; vou encaminhar à equipe responsável para avaliar se é caso de exceção. Pode me detalhar o motivo?"
- ❌ "Pode devolver, sem problema." (sem checar política)

**Cenário**: "Recebi defeituoso."
- ✅ "Sinto pelo transtorno. Pode me enviar uma foto do produto e da embalagem? Vou abrir a troca pelo defeito."
- ❌ "Vou te reembolsar agora." (sem evidência, sem confirmar política).

## Encaminhamento

Encaminhar à equipe responsável quando:
- Pedido está fora do prazo da política da loja → avaliar exceção.
- Cliente pede reembolso em modalidade diferente da compra (ex.: dinheiro em vez de estorno no cartão).
- Valor alto, parcelamento longo, ou cliente B2B com contrato específico.
- Suspeita de fraude ou histórico de devoluções recorrentes.
- Cliente cita CDC, Procon ou risco jurídico.
