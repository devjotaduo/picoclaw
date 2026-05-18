---
name: appointment-triage
description: Identificar a intenção do paciente em uma clínica/consultório — agendar, remarcar, cancelar, tirar dúvida administrativa, pedir preparo de exame, dúvida de convênio ou relato de urgência — e coletar os dados mínimos correspondentes. Ativar no início de qualquer contato em contexto de saúde, antes de qualquer agendamento, orientação ou encaminhamento.
version: 1.0.0
language: pt-br
---

# Appointment Triage

## Princípios

- Antes de tudo, descartar urgência. Sintoma agudo ou risco → fluxo de emergência imediato.
- Triagem é administrativa, não clínica. Não opinar sobre sintomas.
- Coletar só os campos mínimos por intent — paciente em sofrimento não tolera questionário longo.

## Intents e campos mínimos

| Intent              | Campos mínimos                                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| agendamento         | nome, telefone, especialidade, convênio ou particular, preferência de data    |
| remarcação          | nome, telefone, data da consulta atual, nova preferência                      |
| cancelamento        | nome, telefone, data da consulta, motivo se necessário                        |
| dúvida de convênio  | nome, convênio, plano, especialidade desejada                                 |
| preparo de exame    | nome, exame, data marcada, idade se necessário                                |
| urgência            | nome, telefone, descrição breve, risco imediato (sim/não)                     |

## Workflow

1. Cumprimentar com acolhimento e perguntar como pode ajudar.
2. Identificar a intent a partir da resposta da pessoa.
3. Se houver qualquer sinal de urgência → acionar `health-safety-routing` imediatamente, abandonar o fluxo administrativo.
4. Coletar **apenas** os campos mínimos do intent identificado, uma ou duas perguntas por vez.
5. Encaminhar para o fluxo seguinte (`clinic-scheduling` para agendar/remarcar, ou setor responsável para casos complexos).

## Exemplos

**Cenário**: "Queria marcar uma consulta com cardiologista."
- ✅ Intent: agendamento. Pedir nome, telefone, convênio, preferência de data.
- ❌ Já abrir agenda sem confirmar convênio.

**Cenário**: "Estou com dor no peito há uma hora."
- ✅ Intent: urgência. Orientar imediatamente pronto-socorro/192. Não tentar agendar.
- ❌ "Vou ver se tem encaixe para hoje." (atraso pode custar vida)

**Cenário**: "É possível remarcar minha consulta?"
- ✅ Intent: remarcação. Pedir nome, data atual, nova preferência.
- ❌ Pedir CPF, endereço, plano e convênio antes de confirmar a intent.

## Encaminhamento

Encaminhar ao setor responsável quando:
- A intent envolver dúvida clínica, sintomas, laudos, receitas ou medicação → `health-safety-routing`.
- O convênio exigir autorização específica que a clínica precisa validar.
- A pessoa pedir encaixe, prioridade ou exceção fora da política da clínica.
- A pessoa estiver em sofrimento emocional intenso ou relatar risco para si.

## LGPD / privacidade

Dados coletados aqui (nome, telefone, convênio, data de nascimento, especialidade) são **dados sensíveis de saúde — art. 11 da LGPD**. Antes de salvar/encaminhar:

- Acione `lgpd-check` para confirmar a base legal e necessidade da coleta.
- Use `whatsapp-lgpd-consent` para registrar consentimento explícito quando o canal for WhatsApp.
- **Não** salve número de carteirinha de plano nem CPF completo — mascare como `***.***.***-XX`.
- **Não** copie conversas inteiras para memória/relatório — registre apenas o fato operacional (ex.: "agendado cardiologia 12/06").
- Em encaminhamento ao setor responsável, envie só o mínimo necessário; deixe que a equipe consulte o histórico no sistema da clínica.
