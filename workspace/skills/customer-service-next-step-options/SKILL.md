---
name: customer-service-next-step-options
description: Generate multiple customer service improvement ideas or next-step options with short titles and brief usage guidance when the user asks how to improve an atendimento or wants choice-ready options.
---
# Customer Service Next-Step Options

Use this skill when the user wants several ideas for improving a customer service interaction, service flow, WhatsApp atendimento, or support experience and expects option-style output rather than a single recommendation.

## What this skill is for

This skill handles requests such as:
- asking for 3, 4, or more improvement options for an atendimento
- asking for next steps to improve a customer service interaction
- requesting choice cards, option lists, or decision-ready alternatives
- wanting each option labeled with a short title plus a brief explanation
- wanting to pause after the list so the user can choose one option

Use it when the main goal is ideation and structured option presentation.

Do not use it when the task is primarily:
- writing multiple greeting or opener text variants only
- routing by customer intent
- verifying identity
- answering a policy question
- handing off to a human
- updating contact history or CRM profile

## What to deliver

Choose the smallest useful format that matches the request:

1. **Simple option list**
- Use when the user asks for improvement ideas or next steps.
- Provide 3 to 5 options.
- For each option, include:
  - short title
  - one sentence explaining when to use it

2. **Choice-card format**
- Use when the user explicitly asks for cards, selection options, or button-ready choices.
- For each card, include:
  - label or number
  - short title
  - short description
  - optional button text if the user asks for it

3. **Selection-first flow**
- Use when the user says they want to choose one option before continuing.
- End with a short prompt such as asking them to pick 1, 2, 3, or 4.

## Execution steps

### 1. Identify the improvement target
Read the user request and determine what is being improved, such as:
- the whole atendimento
- the first message
- triage
- follow-up
- response clarity
- organization of information
- customer context usage
- escalation flow

If the user says only “improve this atendimento” and provides little detail, keep the options broad and generally useful.

### 2. Infer the expected output structure
Look for formatting cues in the request.

Common signals:
- “me dê 4 opções” -> return exactly 4 options
- “próximos passos” -> frame each option as an actionable next move
- “em cards de escolha” -> format each item like a card
- “título curto e uma frase explicando quando usar” -> keep each item compact
- “espere eu escolher” -> do not continue beyond presenting the options

Match the requested structure exactly if specified.

### 3. Build distinct options
Create options that are meaningfully different from each other. Prefer improvement categories such as:
- diagnosis or audit of the current atendimento
- opening message improvement
- triage clarification
- response organization
- follow-up improvement
- use of customer history or context
- FAQ or knowledge-based resolution
- escalation or human handoff refinement

Avoid producing near-duplicates that differ only by wording.

### 4. Write concise titles
Each title should be short, clear, and decision-friendly.

Good patterns:
- Diagnóstico rápido
- Ajuste da mensagem inicial
- Triagem mais clara
- Follow-up mais eficiente
- Histórico do cliente no atendimento
- Atendimento com contexto do cliente

Prefer titles with 2 to 5 words.

### 5. Add a short “when to use” explanation
For each option, write one sentence that explains when the option is appropriate.

Guidelines:
- describe the problem signal or scenario
- keep it practical and easy to compare
- avoid long implementation detail unless asked

Example pattern:
- Use when conversations stall early and you need clearer direction from the start.

### 6. Keep the options actionable but lightweight
The purpose is to help the user choose a direction, not to fully implement it yet.

So:
- present the option clearly
- explain when it fits
- stop before a long rollout plan unless the user asks for expansion

### 7. Close with a selection prompt when useful
If the user is choosing among options, end with a brief instruction such as:
- If you want, choose 1, 2, 3, or 4.
- Pick the option you prefer and I can expand it.
- If you want, I can turn one of these into a ready-to-use flow.

## Response style rules

- Keep the writing clear and compact.
- Prefer practical language over abstract consulting language.
- Make each option easy to compare quickly.
- Do not overload each option with multiple ideas.
- If the user asks for short options, keep descriptions to one sentence.
- If the user asks for WhatsApp-friendly output, keep titles and descriptions compact.

## Output templates

### Template A: short next-step options
1. **[Short title]**  
Use when [specific scenario or problem].

2. **[Short title]**  
Use when [specific scenario or problem].

3. **[Short title]**  
Use when [specific scenario or problem].

4. **[Short title]**  
Use when [specific scenario or problem].

### Template B: choice cards
**1. Card: [category]**  
**Título:** [short title]  
**Descrição:** [short explanation of the improvement]  
**Botão:** [optional CTA]

## Boundaries

Do not switch into detailed policy resolution, CRM editing, identity verification, or intent classification unless the user explicitly changes the task.

If the user later chooses one option, the next response should deepen only that selected direction instead of regenerating the whole list.