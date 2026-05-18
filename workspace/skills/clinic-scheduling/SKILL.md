---
name: clinic-scheduling
description: Conduzir o workflow de agendamento, remarcação ou cancelamento de consultas em clínica/consultório — verificar disponibilidade, confirmar especialidade/profissional/convênio/data/horário/documentos. Ativar após `appointment-triage` ter identificado a intent como agendamento, remarcação ou cancelamento. Nunca confirmar encaixe, prioridade ou exceção sem aprovação explícita da clínica.
version: 1.0.0
language: pt-br
---

# Clinic Scheduling

## Princípios

- Sempre consultar a base de profissionais e a agenda da clínica antes de oferecer datas.
- Não prometer horários que não estão liberados. Não inventar profissionais.
- Encaixe e exceção exigem aprovação da equipe responsável — nunca decidir aqui.

## Workflow de agendamento

1. Confirmar **especialidade** desejada (consultar módulo de Profissionais para listar especialidades disponíveis).
2. Confirmar **convênio** ou particular (consultar Company Context para convênios aceitos).
3. Confirmar **profissional** (opcional — se a pessoa tiver preferência) e checar quais profissionais atendem a especialidade + convênio.
4. Oferecer datas/horários disponíveis (consultar agenda).
5. Confirmar **dados do paciente**: nome completo, telefone, data de nascimento se necessário para o sistema da clínica.
6. Informar **documentos necessários** e **política de atraso/cancelamento** da clínica.
7. Confirmar tudo em uma mensagem final: profissional, data, horário, endereço, documentos, política.

## Workflow de remarcação

1. Localizar consulta atual (data, profissional).
2. Confirmar motivo da remarcação se relevante (não obrigatório).
3. Verificar disponibilidade do mesmo profissional. Se não houver, oferecer outro da mesma especialidade.
4. Confirmar nova data/horário.
5. Avisar política da clínica sobre remarcações (prazo, taxas se houver).

## Workflow de cancelamento

1. Localizar consulta.
2. Confirmar cancelamento ("Confirma o cancelamento da consulta do dia X com Dr. Y às Zh?").
3. Avisar política de cancelamento (prazos, ressarcimento).
4. Registrar e fechar.

## Exemplos

**Cenário**: "Queria marcar com cardiologista, sou Unimed."
- ✅ Consultar módulo de Profissionais → "Atendemos cardiologia com Unimed; temos a Dra. Maria Santos e o Dr. João Silva. Tem preferência por algum?"
- ❌ "Marquei com Dr. X para amanhã às 10h." (sem consultar agenda real)

**Cenário**: "Preciso pra hoje, é urgente."
- ✅ "Encaixe de urgência depende da aprovação da clínica. Vou encaminhar para a equipe responsável validar." (e se for risco clínico, acionar `health-safety-routing`)
- ❌ "Vou colocar você no encaixe das 14h."

## Encaminhamento

Encaminhar à equipe responsável quando:
- Pedido de encaixe, prioridade ou horário fora da agenda regular.
- Convênio exigir autorização ou validação que o sistema da clínica não automatiza.
- Documentação do paciente estiver incompleta ou em divergência.
- Pessoa relatar qualquer sintoma além do administrativo → `health-safety-routing`.

## LGPD / privacidade

Esta skill movimenta **dados sensíveis de saúde — art. 11 da LGPD**: identificação do paciente, profissional, convênio, especialidade, horário. Regras de mínimo:

- Acione `lgpd-check` antes de gravar dado pessoal em memória persistente.
- Use `whatsapp-lgpd-consent` para registrar consentimento quando o canal for WhatsApp.
- **Não** registrar diagnóstico, sintoma, resultado de exame ou prontuário — isso é responsabilidade do profissional e fica no sistema da clínica.
- **Não** salvar carteirinha completa de plano nem CPF completo — mascare (`***.***.***-XX`, número da carteirinha truncado nos últimos 4).
- Confirmar dados em voz alta com o paciente antes de gravar (evita transcrição errada de número/data).
- Não compartilhar agenda de um paciente com outro paciente nem confirmar publicamente que "fulano marcou consulta".
