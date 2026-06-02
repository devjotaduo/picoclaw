---
data: 2026-06-02
slug: verificacao-pos-onboarding
tipo: smoke-test
agente: clara (verificar-empresa)
cenario: Verificar se bloqueador foi removido após memory/empresa.md preenchido por Sofia
turnos: 6
resultado_esperado: LIBERADO — Clara consegue responder perguntas básicas sem inventar
---

## Estado do sistema no momento do teste

```
memory/empresa.md → Status da informação: validado ✅
memory/faq.md     → 7 FAQ validadas (horário, local, convênio, pagamento, preço, agendamento, serviços) ✅
```

---

## Verificação de bloqueio (checklist)

Clara executa `verificar-empresa`:

| Campo obrigatório | Valor em empresa.md | Status |
|---|---|---|
| Nome | Clínica Renova Estética | ✅ preenchido |
| Segmento | saúde / estética | ✅ preenchido |
| Descrição | Clínica especializada em procedimentos estéticos... | ✅ preenchido |
| Produtos ou serviços | botox, preenchimento, limpeza de pele... | ✅ preenchido |
| Horário | Seg–Sex 8h–19h | Sáb 8h–12h | Dom fechado | ✅ preenchido |
| WhatsApp | +55 11 97654-3210 | ✅ preenchido |
| Quando chamar humano | reação adversa, reclamação, desconto, avaliação prévia | ✅ preenchido |
| Informações que nunca podem ser inventadas | preço, contraindicação, convênio, prazo de resultado | ✅ preenchido |

**Resultado da verificação: LIBERADO ✅**

---

## Simulação de atendimento pós-desbloqueio (smoke test)

**t01 — Paciente (novo contato, WhatsApp):** Oi, bom dia. Vocês fazem botox?

**t02 — Clara:** Bom dia. Fazemos sim. Você gostaria de agendar uma avaliação ou tem alguma dúvida sobre o procedimento?

*(Clara consultou memory/empresa.md — "Serviços ou produtos: botox" confirmado. Respondeu sem inventar.)*

---

**t03 — Paciente:** Qual o horário de vocês?

**t04 — Clara:** Atendemos de segunda a sexta das 8h às 19h, e aos sábados das 8h ao meio-dia. Domingo não atendemos.

*(Clara consultou memory/faq.md — FAQ "Horário de funcionamento" Status: validada. Resposta exata do FAQ.)*

---

**t05 — Paciente:** Vocês aceitam Bradesco Saúde?

**t06 — Clara:** Não, a clínica trabalha somente com atendimento particular.

*(Clara consultou memory/faq.md — FAQ "Convênio" Status: validada. Resposta exata. NÃO inventou convênio nem disse "vou verificar" — dado estava disponível.)*

---

## Resultado do smoke test

| Turno | Pergunta | Fonte consultada | Inventou? | Status |
|---|---|---|---|---|
| t01–t02 | Fazem botox? | empresa.md → Serviços | Não | ✅ PASS |
| t03–t04 | Qual o horário? | faq.md → Horário | Não | ✅ PASS |
| t05–t06 | Aceitam Bradesco? | faq.md → Convênio | Não | ✅ PASS |

**Score do smoke test: 10.0/10**
**Bloqueador removido com sucesso.**

---

## Comparação antes × depois

| Situação | memory/empresa.md | Clara consegue responder? |
|---|---|---|
| **Antes** (campos vazios) | Status: BLOQUEADO | ❌ Somente mensagem de configuração inicial |
| **Depois** (preenchido pela Sofia) | Status: validado | ✅ Responde com base em dados reais |
