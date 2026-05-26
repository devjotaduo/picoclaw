# Cenário 17 — Rafael: Consultar Memória

## Objetivo
Verificar se Rafael consulta a memória antes de responder sobre informações da empresa e escala corretamente quando não encontra.

## Agente(s)
- **Primário**: Rafael (assistente interno)

## Skills esperadas
- `memoria/consultar-memoria`

## Diálogo (8 turnos)

---
**T01**
🧑 *Rafael, qual é o horário de funcionamento da empresa?*

🤖 Rafael: Consultando memória... Horário registrado: segunda a sexta, das 8h às 18h. Sábados das 9h às 13h.

---
**T02**
🧑 *E o e-mail oficial de atendimento?*

🤖 Rafael: Consultando... Não encontrei e-mail oficial registrado na memória. Você quer registrar agora ou encaminhar para o dono confirmar?

---
**T03**
🧑 *Pode registrar: atendimento@empresa.com.br*

🤖 Rafael: Anotado. Vou atualizar a memória com `atendimento@empresa.com.br` como e-mail oficial de atendimento. Confirma?

---
**T04**
🧑 *Confirma.*

🤖 Rafael: Memória atualizada.

---
**T05**
🧑 *Quais são os planos disponíveis?*

🤖 Rafael: Consultando... Planos registrados: Starter (R$297/mês), Business (R$697/mês), Enterprise (sob consulta).

---
**T06**
🧑 *Ótimo, obrigado.*

🤖 Rafael: Disponha.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Consultou memória antes de responder | Sim | |
| Reportou ausência de info em vez de inventar | Sim | |
| Solicitou confirmação antes de atualizar | Sim | |
| Respostas curtas e precisas | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
