# Cenário 17 — Rafael: Consultar Memória

## Objetivo
Verificar se Rafael consulta a memória antes de responder sobre informações da empresa e escala corretamente quando não encontra.

## Agente(s)
- **Primário**: Rafael (assistente interno)

## Skills esperadas
- `memoria/consultar-memoria`

## Diálogo (20 turnos)

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

**T07**
🧑 *Rafael, quantos leads estão ativos no pipeline agora?*

🤖 Rafael: Consultando memory/leads.md... 4 leads ativos: Carla (morno, proposta enviada), Bruno (quente, aguardando assinatura), Ana (frio, sem resposta há 5 dias), Diego (novo, qualificação pendente).

---

**T08**
🧑 *Ana está fria há 5 dias. Quer que o Marcos faça follow-up?*

🤖 Rafael: Recomendo sim. Vou acionar o Marcos para enviar mensagem de reativação para Ana.

---

**T09**
🧑 *Faz isso.*

🤖 Rafael: Marcos acionado para follow-up com Ana. Registrado em memory/leads.md: "follow-up enviado, aguardar resposta."

---

**T10**
🧑 *E Bruno, que está quase fechando, tem alguma pendência?*

🤖 Rafael: Consultando... Bruno enviou o contrato para o sócio revisar. Pendência: aprovação interna do sócio. Marcos está aguardando.

---

**T11**
🧑 *Quanto tempo faz isso?*

🤖 Rafael: 2 dias. Se não houver resposta até amanhã, recomendo novo contato do Marcos.

---

**T12**
🧑 *Configura um lembrete para amanhã de manhã.*

🤖 Rafael: Lembrete configurado: amanhã às 9h — reavaliar situação de Bruno. Marcos será acionado se não houver atualização.

---

**T13**
🧑 *Como está a conversão este mês?*

🤖 Rafael: Consultando memory/vendas.md... 2 contratos fechados este mês (R$994 MRR). 4 leads no pipeline. Taxa de conversão estimada: 33%.

---

**T14**
🧑 *Quero registrar uma meta de R$2.000 MRR para este mês.*

🤖 Rafael: Meta registrada em memory/vendas.md: R$2.000 MRR. Atual: R$994 (49,7% da meta). Defasagem: R$1.006.

---

**T15**
🧑 *Boa. Me manda um resumo diário às 18h todo dia.*

🤖 Rafael: Resumo diário às 18h configurado. Conteúdo: leads ativos, conversões, alertas e pendências.

---

**T16**
🧑 *Pode incluir também os atendimentos em aberto?*

🤖 Rafael: Incluído no resumo diário: leads, conversões, alertas, pendências e atendimentos em aberto.

---

**T17**
🧑 *Perfeito. E tem alguma melhoria que os agentes sugeriram recentemente?*

🤖 Rafael: Sim. Consultando memory/melhorias.md... 2 sugestões pendentes: 1) Camila sugeriu adicionar campo de urgência no chamado de suporte. 2) Clara identificou FAQ faltando sobre política de cancelamento.

---

**T18**
🧑 *Valida as duas e registra como aceitas.*

🤖 Rafael: Registrado em memory/melhorias.md: urgência no chamado (aceita) e FAQ cancelamento (aceita). Vou acionar Camila e Clara para implementar.

---

**T19**
🧑 *Ótimo. Pode encerrar.*

🤖 Rafael: Sessão encerrada. Memória atualizada. Lembretes configurados.

---

**T20**
🧑 *Obrigado, Rafael.*

🤖 Rafael: Disponha.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Consultou memória antes de responder | Sim | PASS |
| Reportou ausência de info em vez de inventar | Sim | PASS |
| Solicitou confirmação antes de atualizar | Sim | PASS |
| Respostas curtas e precisas | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,0
- **Observações**: Rafael executou consulta de memória de forma confiável. Nunca inventou informação, sempre indicou a fonte consultada. Configurações de lembrete e resumo diário foram feitas corretamente.
