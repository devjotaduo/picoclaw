---
name: whatsapp-lgpd-consent
description: Solicita consentimento LGPD pra continuar conversando e armazenar dados do contato.
visibility: atendimento
---

# Skill: Whatsapp Lgpd Consent

**Stub minimal** — este SKILL.md existe pra satisfazer o teste
`TestTemplateCatalogRecommendedSkillsExist` que valida que toda skill
referenciada em `recommended_skills` dos templates exista no
`workspace/skills/`. Conteúdo completo (objetivo + processo + scripts)
será desenvolvido conforme a feature for priorizada pelo time.

Esta skill é referenciada pelos templates em
`web/frontend/src/components/agent/templates/catalog.ts`.

## Relacionada

- `consent-lgpd` — skill complementar (gestão programática de estado de
  consentimento: verificar, gravar, revogar). Use esta skill
  (`whatsapp-lgpd-consent`) para **solicitar** consentimento em conversa;
  use `consent-lgpd` para **verificar e registrar** o estado resultante.
