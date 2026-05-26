---
name: user-provides-business-profile-shortcut
description: Use this skill to user provides business profile details to be captured, structured, and possibly written into workspace memory or dossier records. when the task requires this workflow.
---
# User Provides Business Profile Shortcut

## When To Use
Use `user-provides-business-profile-shortcut` as a direct shortcut instead of replaying `jotaduo-discovery -> tenant-liberation` step by step.

## Procedure
Use `user-provides-business-profile-shortcut` directly when the task matches `User provides business profile details to be captured, structured, and possibly written into workspace memory or dossier records.`.
Follow the source skill guidance below as one compact procedure, then return the final result without replaying unnecessary discovery steps.

## Procedure Details
- `jotaduo-discovery`: Conduz um discovery consultivo com o dono da empresa: apresenta a Jotaduo, entende segmento + fluxo + sistemas + dores, identifica gaps de integração, e ao final RECOMENDA o time de agentes (clara/luna/marcos/camila/lia) com ordem de implantação justificada. Use quando o cadastro da empresa estiver incompleto (memory/empresa.md vazio ou pendente), ou quando o usuário pedir "fazer discovery", "apresentar a Jotaduo", "montar time de agentes", "diagnosticar empresa", "começar onboarding"...
- `tenant-liberation`: Gera relatório de prontidão (readiness) do tenant pós-discovery. Roda 3 níveis de check: universal (Nome/Segmento/Contato), por segmento detectado (saúde/alimentação/varejo/etc), e integrações pendentes (que o ADMIN tem que resolver fora — WhatsApp Business API, sistemas externos, gateway). Esta skill NÃO libera o tenant sozinha — só gera o relatório que o admin usa no painel pra decidir manualmente...

## Procedure Notes
- Task: User provides business profile details to be captured, structured, and possibly written into workspace memory or dossier records.
- Reusable guidance: # User Provides Business Profile Shortcut Use this shortcut when the user is supplying business profile and onboarding information that should be captured, normalized, saved into workspace records, and optionally turned into a post-discovery readiness handoff. ## What this shortcut does This shortcut helps you: 1. Extract business profile facts from the conversation. 2. Normalize and organize the facts into a clean company profile. 3. Update the workspace company memory and dossier records. 4. If the conversation is acting as discovery/onboarding, produce a concise recommended agent rollout order based on the reported pains and operation model. 5. If enough information has been collected, generate a readiness-style handoff for admin review, including unresolved external dependencies. 6. Avoid implying that tenant release is automatic. ## Inputs to capture Extract as many of these as the user provides: - business name - segment/category - city/state or service area - contact WhatsApp - contact email - service model - operating hours - systems in use - booking flow - team/operator flow if mentioned - insurers/plans/accepted payment methods - prices - key pains - unresolved...

## Expected Result
Fechei o discovery da Jotaduo.<|[SPLIT]|>Também gerei o dossiê e atualizei a memória da empresa no workspace.<|[SPLIT]|>Resumo validado:
- clínica em Petrolina
- atendimento presencial e online
- agenda via Shosp
- WhatsApp 87 98855-3793
- horário de segunda a sexta, 10h às 18h
- particular e Bradesco
- consulta particular R$ 200
- dores principais: volum...

## Validation
based on validated examples: main-turn-11-db9105e093f6, main-turn-14-cce56a71e2cf