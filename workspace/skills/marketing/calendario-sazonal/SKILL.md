---
name: calendario-sazonal
description: Consulta datas comemorativas, eventos do setor e datas próprias da empresa. Lia usa esta skill diariamente para sugerir campanhas com antecedência (D-14, D-7, D-3, D-1, D-0) e disparar alertas proativos.
visibility: global
---

# Calendário sazonal

## Quando usar
- Toda manhã (gatilho HEARTBEAT) Lia executa esta skill para ver o que vem nas próximas 2 semanas.
- Quando o dono pedir "o que tem de data esse mês".
- Antes de planejar campanha mensal.

## Fontes consultadas
- `config/calendario-datas.md` — datas comerciais brasileiras.
- `memory/marketing.md` — datas próprias: aniversário da empresa, lançamentos, promoções fixas.
- `memory/empresa.md` — segmento (para datas de nicho).
- `memory/clientes.md` — aniversários de clientes VIP.

## Pipeline proativo por data
| Antecedência | Ação de Lia |
|---|---|
| D-14 | Sugerir tema + esboço de campanha |
| D-7 | Entregar rascunho completo (post + imagem + legenda) |
| D-3 | Reforçar pedido de aprovação se ainda pendente |
| D-1 | Confirmar aprovação; agendar publicação ou alertar Rafael |
| D-0 | Confirmar publicação e acompanhar primeiras métricas |

## Formato de alerta para Rafael
```
[ALERTA MARKETING]
Data: DD/MM — Nome da data
Distância: X dias
Campanha sugerida: (nome)
Status: aguardando aprovação | aprovado | publicado
Ação necessária: ...
```

## Não pode
- Criar campanha em data de luto nacional ou tragédia sem aprovação humana.
- Sobrepor duas campanhas na mesma semana sem avisar conflito.
- Repetir tema idêntico de campanha anterior sem variação.
