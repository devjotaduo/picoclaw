# PRODUCT.md

## Identity

- Product: PicoClaw / Jota Duo Launcher
- Register: product
- Surface: authenticated launcher, tenant dashboard, and operator console
- Current visible brand: Jota Duo
- Language: Portuguese-first, with short operational labels

PicoClaw is an operational AI agent platform for businesses that need to
configure, supervise, and run assistants across chat, WhatsApp, memory,
workflows, and internal agent workspaces. Jota Duo is the visible tenant-facing
brand on the current launcher UI.

## Users

- Tenant admins who configure models, channels, agents, and gateway status.
- Operators who monitor WhatsApp inboxes, reports, pending handoffs, memory,
  cron jobs, and agent activity.
- Internal developer or support users who need fast diagnosis of launcher,
  control-plane, and workspace state.
- Business owners who want AI automation but still need human-readable safety
  and review points.

## Product Jobs

- Start, stop, and diagnose the gateway before a conversation begins.
- Configure AI models, providers, API keys, and default routing.
- Configure WhatsApp channels and related inbox/report workflows.
- Manage multiple agents, templates, skills, memory, and workspace behavior.
- Surface pending work, failures, and unsafe states without visual noise.
- Keep tenant-managed settings separate from SaaS-managed settings.
- Preserve review-before-apply behavior for extracted or generated data.

## Product Principles

- Operational clarity over decoration. The UI should feel like a working
  console, not a marketing page.
- State must be visible. Gateway, model, channel, save-path, and agent status
  should be clear before the user acts.
- Dense but scannable. Favor predictable navigation, compact labels, and stable
  layout over large hero sections or ornamental panels.
- Safety before speed. Irreversible or externally visible actions need clear
  labels, explicit review, or confirmation.
- Tenant boundaries are part of the product. Avoid UI that implies a tenant can
  edit SaaS-owned configuration directly.
- Agent identity matters. Customer-facing personas should feel specific, but
  the admin surfaces should remain quiet and utilitarian.

## Tone And Copy

- Use concise Portuguese labels: direct verbs, concrete nouns, no hype.
- Prefer "Conectar", "Iniciar gateway", "Ver painel", "Configurar modelo",
  "Testar atendente", and similar task labels.
- Error and empty states should explain the blocked action and the next
  practical step in one sentence.
- Avoid generic AI copy such as "revolucione", "poderoso", "mágico",
  "inteligente por padrão", or "experiência incrível".
- Avoid visible instructional prose that repeats what controls already imply.

## Anti-References

- Marketing landing pages, split hero layouts, and decorative feature grids.
- Purple-blue AI gradients, glassmorphism, bokeh blobs, and decorative orbs
  outside the actual assistant status orb.
- Card-heavy dashboards where every section becomes a floating panel.
- Nested cards, side-stripe accents, gradient text, and large metric hero blocks.
- UI that hides disabled or unsafe states instead of explaining them.
- Ambiguous "assistant" branding that does not reveal gateway, channel, or
  model state.

## Success Criteria

- A tenant admin can tell whether chat is available within a few seconds.
- Gateway and model failures are readable in both light and dark modes.
- Main workflows remain usable while backend services are unavailable.
- Navigation supports repeated daily operation without visual fatigue.
- Text contrast meets WCAG AA for normal text wherever the text communicates a
  required action, blocker, or status.
- The interface keeps the current product feel while documenting enough context
  for future design work to stay consistent.
