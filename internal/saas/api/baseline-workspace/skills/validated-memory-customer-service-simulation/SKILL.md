---
name: validated-memory-customer-service-simulation
description: Simulate customer service responses using only validated workspace memory. Use when the user wants realistic customer-facing replies, scripts, or scenario tests without inventing any business information.
---
# Validated Memory Customer Service Simulation

## When to use
Use this skill when the user asks for simulated customer service replies, test scenarios, or customer-facing scripts and explicitly or implicitly requires that the answers rely only on validated workspace memory.

Typical requests include:
- simulate how the business should answer customer questions
- create WhatsApp-style customer service replies
- test internal atendimento using `memory/empresa.md`
- answer as if speaking to a real customer, but without inventing information
- produce multiple scenario responses for a known business segment

Do not use this skill when the task is to discover new business facts, write new memory, or guess missing policies.

## What this skill does
This skill produces customer-service-style responses grounded only in validated workspace memory.

It helps the agent:
- read the available business memory before drafting replies
- extract only supported facts such as hours, channels, price ranges, service list, escalation path, or operational constraints
- convert those facts into natural customer-facing wording
- avoid fabricated details
- explicitly preserve uncertainty where memory is incomplete
- route to human confirmation when booking, pricing, availability, or policy details are not fully validated

## Inputs
Collect or infer these inputs from the user request:
- the target memory source, usually `memory/empresa.md`
- the business context if provided
- the scenarios or customer questions to answer
- the required tone or channel, if specified, such as WhatsApp, receptionist, concise, warm, formal
- any hard constraint such as `use only validated memory`, `do not invent`, or `baseado em memory/empresa.md`

## Execution process
1. Read the validated workspace memory relevant to the target business.
2. Extract only facts that are explicitly supported by memory.
3. Separate the extracted information into two groups:
   - confirmed facts that may be stated directly
   - missing or unvalidated details that must not be invented
4. Review each requested scenario or customer question.
5. For each scenario, decide the response mode:
   - **direct answer** when memory fully supports the answer
   - **bounded answer with caveat** when memory supports part of the answer but not all of it
   - **handoff or confirmation path** when the requested detail depends on unavailable or unvalidated information
6. Write the reply in customer-facing language, as if a real attendant were answering.
7. Keep the wording helpful and natural, but never add unsupported facts.
8. If the user asked for internal evaluation, also include a short note about the decision path, handoff, or risk caused by missing memory.

## Response rules
### 1. State only supported facts
Only mention information that is clearly present in validated memory.

Examples of allowed supported content:
- opening days and hours
- service categories explicitly listed
- price ranges explicitly recorded
- known booking channel such as WhatsApp
- confirmed operational limitations such as paper agenda or manual confirmation
- known escalation to reception or team member

### 2. Do not invent specifics
Do not fabricate:
- exact appointment slots
- same-day availability
- exact service duration
- staff names unless validated
- payment methods unless validated
- detailed policies unless validated
- promotions, guarantees, or package rules unless validated
- precise prices when memory only gives ranges or no pricing

### 3. Use safe wording for partial knowledge
When memory is incomplete, answer with supported information first, then clearly mark what still needs confirmation.

Patterns to use:
- "Temos essa informação de forma geral..."
- "O valor pode variar conforme..."
- "Posso registrar seu pedido e confirmar com a recepção..."
- "A disponibilidade precisa ser confirmada na agenda..."
- "Se quiser, me diga o serviço e o período para eu encaminhar a verificação."

### 4. Prefer helpful containment over refusal
If the answer cannot be completed from memory, do not stop at "não sei".
Instead:
- provide the validated part
- explain the limit briefly
- offer the next safe step such as human confirmation, triage, or collecting the customer’s preference

### 5. Match the user’s requested format
Return the output in the format requested by the user, for example:
- numbered scenario responses
- short scripts
- WhatsApp messages
- internal test report with scenario, reply, decision, and risks

## Output patterns
### A. Customer-facing simulation only
Use when the user wants ready-to-send replies.

For each scenario:
- write a concise natural response
- keep it realistic and business-appropriate
- avoid internal notes unless asked

### B. Internal test format
Use when the user is evaluating coverage or readiness.

For each scenario include:
- scenario summary
- simulated customer-facing reply
- operational decision or routing
- memory gaps or risks

## Decision guidance
### If pricing exists in memory
- present the validated range or exact value only as recorded
- if the final amount depends on variation, say so

### If scheduling exists but live availability is not validated
- say that the request can be registered or checked
- avoid confirming a slot
- route to reception, agenda verification, or human confirmation

### If the customer asks for a human
- offer transfer or forwarding to the team if that path is validated
- do not promise immediate response time unless validated

### If the requested information is absent from memory
- do not answer as though the business had confirmed it
- say that the team can confirm the detail
- optionally ask for the minimum needed information to route the request

## Quality checklist
Before sending the final answer, verify all of the following:
- every factual statement appears in validated memory
- no hidden assumptions were added
- no booking or policy promise exceeds what memory supports
- any unknown detail is clearly marked as pending confirmation
- the tone sounds like a real attendant, not an internal system
- the final answer matches the user’s requested format

## Boundaries
Do not use this skill to:
- create or update business memory
- perform discovery interviews
- infer likely salon or store practices from industry norms
- fill gaps with generic customer service assumptions

If the memory is too sparse to answer safely, provide a minimal bounded response and indicate that confirmation by the business team is required.