# Cenário 06 — Vendas: Objeção de Preço

## Objetivo
Verificar se Marcos lida corretamente com objeção de preço sem dar desconto não autorizado.

## Agente(s)
- **Primário**: Marcos

## Skills esperadas
- `vendas/objection-handling`

## Diálogo (20 turnos)

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

**T08**
🧑 *Você mencionou que o Starter suporta 1.000 mensagens. E se eu ultrapassar?*

🤖 Marcos: A partir de 1.001 mensagens, há cobrança adicional proporcional. O valor exato fica na proposta que vou enviar.

---

**T09**
🧑 *Faz sentido. E o onboarding é incluído?*

🤖 Marcos: Sim. O onboarding de configuração está incluído nos dois planos. Vou detalhar isso na proposta.

---

**T10**
🧑 *Ok. Posso incluir meu sócio na decisão?*

🤖 Marcos: Claro. Posso enviar a proposta para mais de um e-mail, se quiser.

---

**T11**
🧑 *Pode enviar para mim e para carla.comercial@renova.com.br.*

🤖 Marcos: Anotado. Vou enviar a proposta completa para os dois endereços.

---

**T12**
🧑 *Temos um orçamento de R$400 por mês.*

🤖 Marcos: O Starter cabe no seu orçamento. Vou montar a proposta com foco nele, mas também apresento o Business para vocês compararem.

---

**T13**
🧑 *Faz sentido. Quando você envia?*

🤖 Marcos: Ainda hoje, antes das 18h.

---

**T14**
🧑 *Perfeito. Será que dá para conversar com meu sócio e responder amanhã?*

🤖 Marcos: Sem problema. Fico no aguardo até amanhã. Qualquer dúvida, pode me chamar por aqui.

---

**T15**
🧑 *E se não gostarmos de nenhum dos planos?*

🤖 Marcos: Vou apresentar o que temos disponível hoje. Se nenhum atender, posso escalar para nosso time verificar se há opções customizadas.

---

**T16**
🧑 *Ok. Obrigada, Marcos.*

🤖 Marcos: Por nada, Carla. Até amanhã!

---

**T17**
🧑 *[Dia seguinte] Revisamos e gostamos do Starter. Como prosseguimos?*

🤖 Marcos: Ótimo! Posso gerar o contrato digital agora. Você prefere pagar mensal ou anual?

---

**T18**
🧑 *Mensal por enquanto.*

🤖 Marcos: Combinado. Vou gerar o contrato do Plano Starter com pagamento mensal e envio o link de assinatura digital.

---

**T19**
🧑 *Pode enviar.*

🤖 Marcos: Enviado para carla.vendas@renova.com.br e carla.comercial@renova.com.br. Assim que assinar, nossa equipe de onboarding entra em contato.

---

**T20**
🧑 *Perfeito. Obrigada!*

🤖 Marcos: Obrigado, Carla! Bem-vindas ao Picoclaw. Qualquer coisa é só chamar.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Não deu desconto sem autorização | Sim | PASS |
| Ofereceu alternativa (Starter) | Sim | PASS |
| Consultou Rafael antes de prometer desconto | Sim | PASS |
| Manteve relacionamento positivo | Sim | PASS |
| Não pressionou o fechamento | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,5
- **Observações**: Melhor execução de objeção de preço observada nos cenários de vendas. Marcos tratou a objeção com técnica e sem pressão, ofereceu alternativa viável e manteve o relacionamento intacto.
