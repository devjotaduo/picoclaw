---
name: playbook-saude
description: Perguntas extras obrigatórias quando a empresa é clínica, consultório, laboratório ou serviço de saúde. Define o que vira bloqueante antes da empresa ser marcada como validada.
visibility: internal
segment: saude
---

# Playbook — Saúde

## Quando rodar

`Segmento detectado: saude` — clínicas, consultórios médicos, odonto, fisio, psicologia, exames, laboratórios.

## Perguntas (uma por mensagem)

### 1. Canal de agendamento (BLOQUEANTE)

> "Como vocês fazem os agendamentos hoje? WhatsApp? Google Agenda? Algum sistema/CRM próprio?"

Se WhatsApp:
> "É o mesmo WhatsApp do atendimento ou outro número?"

Se CRM:
> "Qual o nome do sistema? (Doutoralia, Memed, iClinic, próprio…)"

Se mistura:
> "Beleza, vou anotar todos. Tem um que é o principal?"

**Grava em `empresa.md`:**
```
Canal de agendamento: <texto livre detalhado>
```

### 2. Convênios aceitos (BLOQUEANTE)

> "Vocês atendem por convênio? Se sim, quais? Ou é só particular?"

Aceitar resposta livre. Se o dono não souber listar todos:
> "Pode me mandar uma lista depois se preferir. Por enquanto deixa os principais."

**Grava:**
```
Convênios aceitos: <lista ou "somente particular">
```

### 3. Especialidades atendidas (BLOQUEANTE)

> "Quais especialidades, exames ou tratamentos vocês oferecem?"

Se for clínica única:
> "É só [especialidade] ou tem outras coisas também?"

**Grava:**
```
Especialidades: <lista>
```

### 4. Política de cancelamento (opcional)

> "E quando o paciente quer cancelar ou remarcar, tem alguma regra? Tipo prazo mínimo, multa?"

**Grava:**
```
Política de cancelamento: <texto>
```

## Sinais de alerta

- Se o dono mencionar "receita", "prescrição", "atestado" → Sofia anota em "Informações que nunca podem ser inventadas" automaticamente: "receita, prescrição, atestado, diagnóstico".
- Se mencionar pacientes idosos ou vulneráveis → Sofia sugere adicionar em "Quando chamar humano": "qualquer dúvida sobre medicação ou sintoma".

## Handoff para Rafael

Quando todas as bloqueantes deste playbook estiverem preenchidas + as do core, Sofia avisa:

> "Pronto! Já organizei tudo da clínica. O Rafael vai assumir e te alertar sobre agendamentos, leads e qualquer coisa estranha. Qualquer mudança me chama."

E notifica Rafael internamente com:
- Segmento: saude
- Canal de agendamento principal
- Volume esperado
