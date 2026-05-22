# Cenário 20 — Fluxo Completo: Suporte → Resolução → Rafael

## Objetivo
Testar o fluxo end-to-end de um ticket de suporte crítico até a resolução e comunicação ao dono.

## Agente(s)
- Clara → Camila → Rafael (3 agentes)

## Skills esperadas
- `atendimento/triagem-inicial`
- `suporte/technical-troubleshooting`
- `suporte/severity-classification`
- `memoria/atualizar-memoria`

## Total de interações: 16 turnos

---
### FASE 1: Triagem (Clara) — Turnos 1–3

**T01**
🧑 *Sistema caiu. Não consigo acessar nada.*

🤖 Clara: Entendo a urgência. Pode me confirmar nome e empresa?

---
**T02**
🧑 *Bruno Costa, Distribuidora Costa.*

🤖 Clara: Bruno, estou te transferindo agora para o suporte técnico com prioridade máxima.

---
**[HANDOFF: Clara → Camila]**

---
### FASE 2: Resolução de Suporte (Camila) — Turnos 3–12

**T03**
🤖 Camila: Olá, Bruno. Sou Camila. Sistema completamente inacessível. Quando começou?

---
**T04**
🧑 *Há 20 minutos.*

🤖 Camila: Alguma alteração feita antes de cair?

---
**T05**
🧑 *Não. Simplesmente parou.*

🤖 Camila: Classificando como P0 — sistema totalmente fora. Abrindo chamado de emergência agora. Nosso técnico será acionado em 5 minutos.

---
**T06**
🧑 *5 minutos? Estou perdendo dinheiro agora!*

🤖 Camila: Entendo completamente, Bruno. Já acionei o time de infraestrutura. Você consegue acessar o painel de controle ou está tudo bloqueado?

---
**T07**
🧑 *Tudo bloqueado. Tela branca.*

🤖 Camila: Entendido. Tentando verificar o status do servidor agora. — Confirmei: houve uma queda de conectividade no servidor às 14h02. O time está restaurando agora. Estimativa: 15 minutos.

---
**T08**
🧑 *15 minutos tá bem.*

🤖 Camila: Vou te avisar assim que subir. Pode deixar esta conversa aberta?

---
**T09**
🧑 *Sim.*

🤖 Camila: [10 minutos depois] Bruno, sistema restaurado. Pode tentar acessar agora?

---
**T10**
🧑 *Funcionou! Obrigado.*

🤖 Camila: Ótimo! Vou registrar o incidente com causa raiz e acionar o time para evitar recorrência. Posso te enviar um resumo do ocorrido por e-mail?

---
**T11**
🧑 *Pode ser.*

🤖 Camila: Perfeito. Enviado em breve para o e-mail cadastrado. Chamado encerrado como P0-resolvido em 12 minutos.

---
**T12**
🧑 *Obrigado, Camila.*

🤖 Camila: Por nada. Fique à vontade para chamar se precisar.

---
**[HANDOFF: Camila → Rafael (notificação interna)]**

---
### FASE 3: Notificação ao Dono (Rafael) — Turnos 13–16

**T13**
🤖 Rafael: Alerta interno: incidente P0 resolvido. Distribuidora Costa — queda de conectividade no servidor, duração 12 minutos (14h02–14h14). Resolvido por Camila. Causa: falha de rede. Nenhum dado perdido.

---
**T14**
🧑 *Rafael, preciso de um resumo para enviar ao Bruno.*

🤖 Rafael: Resumo para cliente:

*"Prezado Bruno, informamos que o acesso ao sistema ficou indisponível entre 14h02 e 14h14 devido a uma instabilidade de rede no servidor. O problema foi resolvido em 12 minutos. Pedimos desculpas pelo transtorno e implementamos monitoramento adicional para evitar recorrência."*

---
**T15**
🧑 *Aprovado. Envia para o e-mail cadastrado.*

🤖 Rafael: E-mail enviado para o endereço cadastrado da Distribuidora Costa.

---
**T16**
🧑 *Obrigado, Rafael.*

🤖 Rafael: Incidente registrado em memória. Disponha.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara fez handoff imediato (urgência P0) | Sim | |
| Camila classificou corretamente como P0 | Sim | |
| Camila comunicou ETA ao cliente | Sim (15 min) | |
| Chamado encerrado com causa raiz | Sim | |
| Rafael consolidou e notificou dono | Sim | |
| Texto de comunicação ao cliente aprovado antes de enviar | Sim | |
| Nenhuma invenção de causa técnica | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
