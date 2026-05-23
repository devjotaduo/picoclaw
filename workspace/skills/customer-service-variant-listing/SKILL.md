---
name: customer-service-variant-listing
description: Generate multiple customer service or atendimento variants such as opening messages, greeting texts, triage prompts, sector names, or button-ready options when the user asks for several alternatives.
---
# Customer Service Variant Listing

Use this skill when the user asks for multiple options of customer service wording, especially requests like "me dê 4 opções de atendimento", "liste opções de atendimento", or "crie variações de mensagem de atendimento".

## What this skill is for

This skill handles broad variation requests for customer service language, including:
- opening service messages
- greeting messages
- atendimento phrasing variants
- triage/opening prompts
- department or service label options
- WhatsApp-ready customer service text options
- professional, friendly, direct, or welcoming variants

Use it when the user mainly wants several alternatives, not a full routing workflow, identity verification process, or CRM update.

## When to use

Use this skill when the user:
- asks for 3, 4, 5, or more atendimento options
- wants multiple versions of a service greeting or opener
- asks to list customer service names or categories
- wants options in markdown
- asks for different tones such as professional, human, direct, or welcoming
- wants short ready-to-send text blocks for support or atendimento

## When not to use

Do not use this skill when:
- the main task is classifying intent and routing to a specialist agent
- the task is verifying customer identity before account changes
- the task is handing off to a human with internal context
- the task is updating customer profile records
- the user wants only one finalized message rather than multiple options

## Output formats

Choose the smallest useful format that satisfies the request.

### 1. Short labeled option list
Use when the user asks to "liste" or wants simple names/categories.

Example structure:
- Atendimento inicial
- Atendimento comercial
- Suporte técnico
- Pós-venda

### 2. Multiple ready-to-send message variants
Use when the user wants opening texts, greetings, or scripts.

Example structure:
- Opção 1 — Direta e profissional
- Opção 2 — Acolhedora
- Opção 3 — Triagem
- Opção 4 — Comercial

Each option should be complete enough to send as-is.

### 3. Markdown-formatted blocks
Use when the user explicitly asks for markdown.

Format each option with a heading and a fenced markdown block containing the message text.

## Execution steps

### 1. Read the request literally
Identify these elements:
- how many options are requested
- whether the user wants names only or full text messages
- desired format, especially markdown
- desired tone if stated
- channel hints such as WhatsApp, support, sales, or general atendimento

If the user gives no tone, default to varied tones across the options.

### 2. Infer the target artifact
Choose one of these outputs:
- names only
- short phrases
- full opening messages
- triage prompts
- button or menu labels

If the user says only "opções de atendimento" and gives no extra context, prefer either:
- a short labeled list of atendimento categories, or
- several opening message variants if the surrounding phrasing suggests copywriting

### 3. Build distinct variants
Make each option meaningfully different. Vary one or more of:
- tone: professional, warm, direct, welcoming
- function: greeting, triage, support, commercial, follow-up
- length: concise or slightly expanded
- structure: plain opener, question-led opener, category-led opener

Do not create options that differ only by one or two words.

### 4. Keep language ready to use
Write natural customer-facing Portuguese unless the user requests another language.

For message variants:
- start with a greeting or opening line
- state availability to help
- if useful, ask the user what they need
- keep it short unless the user requests something longer

For category lists:
- use clear and familiar labels
- avoid internal jargon unless the user asks for internal sector naming

### 5. Match formatting exactly
If the user asks for markdown:
- present a heading per option
- include the text inside markdown code fences when the intent is to copy markdown content
- keep spacing clean and consistent

If the user does not ask for markdown:
- use a simple numbered list or bullets

### 6. Add a lightweight follow-up only if helpful
After delivering the options, you may offer tightly related next steps, such as:
- more human versions
- more professional versions
- WhatsApp button labels
- versions for sales, support, or finance

Keep the follow-up brief.

## Quality bar

The response should:
- satisfy the requested number of options exactly
- keep each option distinct
- sound natural and customer-safe
- be immediately usable without editing
- avoid overexplaining unless the user asked for analysis

## Avoid patterns

Avoid:
- giving fewer or more options than requested
- repeating the same message with trivial wording changes
- mixing internal process instructions into customer-facing copy
- turning a simple variant request into a full service workflow
- adding unnecessary operational or policy detail

## Default response strategy

If the request is ambiguous, deliver 4 concise options with varied tones and clear labels. If markdown is requested, format each option as a markdown-ready block.

## Learned pattern notes for reviewers

Validation showed repeated user requests for multiple atendimento variants, including:
- "me de 4 opcoes de atendimento em markdown"
- "liste 4 opções de atendimento"

Observed successful output patterns:
- four labeled customer-service opening messages in markdown
- four simple atendimento category names

This pattern does not cleanly belong inside identity verification, handoff, intent routing, or WhatsApp profile management. It is a standalone copy-generation workflow for customer service variants.