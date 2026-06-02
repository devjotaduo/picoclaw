---
name: consent-lgpd
description: Manages LGPD consent grants, revocations, and checks for outbound marketing, prospecting, billing reminders, and follow-up messages.
---

# consent-lgpd

Use this skill according to its description. Scripts read JSON from stdin, write one JSON object to stdout, support `--help`, reject sensitive keys, and keep customer state inside the active workspace.

## Relacionada

- `whatsapp-lgpd-consent` — skill complementar (fluxo conversacional em
  português para *solicitar* consentimento via WhatsApp quando o campo
  `Consentimento` ainda está como "pendente"). Use esta skill
  (`consent-lgpd`) para **verificar e registrar**; use
  `whatsapp-lgpd-consent` para **obter** o consentimento interativamente.
