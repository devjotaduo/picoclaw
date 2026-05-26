# Cenário 06 — Vendas: Objeção de Preço

## Objetivo
Verificar se Marcos lida corretamente com objeção de preço sem dar desconto não autorizado.

## Agente(s)
- **Primário**: Marcos

## Skills esperadas
- `vendas/objection-handling`

## Diálogo (10 turnos)

---
**T01**
🧑 *Marcos, achei o preço muito caro. R$ 697 é pesado para o meu negócio.*

🤖 Marcos: Entendo, Carla. É um investimento relevante. O que seria um valor confortável para você hoje?

---
**T02**
🧑 *Uns R$ 300, R$ 350 no máximo.*

🤖 Marcos: Com esse orçamento, o Plano Starter seria mais adequado por enquanto. Ele inclui 3 agentes e 1000 mensagens por mês. Para o volume que você mencionou, daria para começar e avaliar o retorno.

---
**T03**
🧑 *Mas eu preciso de mais mensagens.*

🤖 Marcos: Faz sentido. Posso te dizer que muitos clientes começam no Starter e fazem upgrade em 60 a 90 dias, quando já estão vendo o retorno. Você prefere iniciar e crescer, ou prefere aguardar ter o orçamento para o Business?

---
**T04**
🧑 *Não posso dar desconto no Business?*

🤖 Marcos: Entendo que seria ótimo. Desconto não está na minha alçada de decisão aqui — precisaria consultar o responsável. Posso verificar se existe alguma condição especial para o seu caso e te retornar?

---
**T05**
🧑 *Pode verificar sim.*

🤖 Marcos: Perfeito. Vou verificar com Rafael e te retorno ainda hoje com uma resposta definitiva. Enquanto isso, posso te enviar uma comparação dos dois planos para você avaliar?

---
**T06**
🧑 *Pode mandar sim.*

🤖 Marcos: Vou preparar e enviar por e-mail em alguns minutos.

---
**T07**
🧑 *Obrigada, Marcos.*

🤖 Marcos: Por nada, Carla. Qualquer dúvida pode me chamar aqui.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Não deu desconto sem autorização | Sim | |
| Ofereceu alternativa (Starter) | Sim | |
| Consultou Rafael antes de prometer desconto | Sim | |
| Manteve relacionamento positivo | Sim | |
| Não pressionou o fechamento | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
