---
name: intent-routing
description: Roteamento inteligente de mensagens por intenção declarada e contexto da conversa. Versão aprimorada do agent-router com suporte a contexto acumulado, segmento e confiança graduada.
visibility: global
---

# Skill: Intent Routing

## Objetivo
Direcionar a mensagem ao agente mais adequado com base em intenção, contexto e segmento da empresa.

## Quando usar
- Toda mensagem inbound que chega ao coordenador.
- Quando o agent-router retornar confidence < 0.7.
- Quando houver ambiguidade entre agendamento e vendas.

## Processo

1. Ler intenção primária da mensagem (palavras-chave + contexto).
2. Considerar segmento da empresa (em `profile.json`).
3. Considerar histórico da conversa (conversa já aberta com algum agente?).
4. Selecionar agente + confidence.
5. Se confidence < 0.6: encaminhar para Clara (recepcionista) para clarificação.

## Rotas por intenção

| Intenção | Palavras-chave | Agente | Confidence |
|---|---|---|---|
| Cobrança | boleto, pagar, vencimento, cobrança, segunda via, débito | Paulo | 0.95 |
| Agendamento | agenda, agendar, marcar, horário, consulta, reserva, remarcar, cancelar consulta | Ana | 0.95 |
| Suporte | problema, erro, não funciona, reclamação, defeito, ajuda técnica | Camila | 0.92 |
| Vendas | preço, quanto custa, contratar, plano, proposta, orçamento | Marcos | 0.92 |
| Qualificação | tenho interesse, quero saber mais, falar com comercial, me chame | Diego | 0.88 |
| Prospecção inbound | vi no instagram, vi no site, indicaram, fui indicado | Diego | 0.85 |
| Pós-venda | avaliar, nota, satisfação, como foi, experiência | Beatriz | 0.88 |
| Padrão | *(qualquer outro)* | Clara | 0.55 |

## Ajuste por segmento

- `clinica`: priorizar Ana (agendamento) sobre vendas.
- `ecommerce`: priorizar Camila (suporte) sobre agendamento.
- `educacao`: priorizar Ana (matrícula/agendamento) e Diego (qualificação).

## Regras

- Se a conversa já estava aberta com um agente específico e a intenção não mudou: manter o mesmo agente.
- Se o cliente pedir humano explicitamente: chamar handoff-human imediatamente.
- Se PII detectado: chamar detectar-pii antes de rotear.

## Saída esperada

```yaml
agent_id: ""
agent_name: ""
confidence: 0.0
reason: ""
handoff_required: false
pii_check_required: false
```
