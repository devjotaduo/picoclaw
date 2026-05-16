# Template Runtime Business Rules

This document records the current business contract for dashboard agent
templates, runtime reflection, and gateway readiness.

## Current Runtime Shape

PicoClaw has two separate concerns:

- The launcher/dashboard lets an operator configure the agent through an editor.
- The gateway runs the actual channels and agent loop that answer messages.

The active production workspace for this installation is:

```text
/root/.picoclaw/workspace
```

The repo-local `workspace/` directory is not the live runtime workspace for this
deployment. Treat it as seed/example workspace unless the config explicitly
points there.

## Source Of Truth

When a template is applied from the dashboard, the backend writes five runtime
artifacts:

| Artifact | Purpose | Runtime role |
| --- | --- | --- |
| `AGENT.md` | Main prompt plus frontmatter such as model, skills, and tool allowlists. | Loaded by the agent registry and context builder. |
| `SOUL.md` | Identity, personality, values, tone, and language. | Included in the system prompt by the context builder. |
| `behavior.json` | Hard runtime switches, channel filters, media rules, schedule snapshot, throttles, privacy, and handoff settings. | Loaded by `pkg/agent` and exposed to `pkg/channels` as behavior filters. |
| `agent_config.json` | Full editor payload, including arrays that are flattened into markdown. | Used for dashboard round-trip editing; not the primary runtime prompt source. |
| `config.json` `agents.defaults.active_template_id` | Selected template id. | Lets the dashboard remember which template is active across reloads. |

The default agent is `main`. When `agents.list` is empty, `main` is implicit and
uses the configured default workspace. Named agents use the runtime's existing
multi-agent model: they appear in `agents.list` and, when no explicit workspace
is configured, use a sibling workspace named `workspace-<agent_id>`.

The rendered runtime files are the operational source of truth. If
`agent_config.json` fails to save, the apply call may still succeed with a
warning because `AGENT.md`, `SOUL.md`, and `behavior.json` are what the runtime
uses.

## Template Apply Contract

Applying a template must:

1. Validate the incoming payload.
2. Render `AGENT.md` from the prompt/business fields.
3. Render `SOUL.md` from the identity/style fields.
4. Write `behavior.json` from the behavior fields plus the denormalized company
   schedule.
5. Persist the full payload to `agent_config.json` for editor round-trip.
6. Persist config state:
   - for `main`, update `active_template_id` for dashboard state;
   - for named agents, create/update `agents.list` so the runtime registry can
     load the new workspace.
7. Trigger gateway `/reload` best-effort so runtime fields are reflected without
   a full gateway restart.

The apply path must not silently rewrite unrelated live business data. If the
payload says `presentation = "Barateiro da construcao"` and
`company_info.name = "Sua Empresa"`, the rendered prompt may contain both. That
is payload data mismatch, not renderer drift.

Named-agent applies must not overwrite `agents.defaults.active_template_id`.
That marker remains the dashboard state for the main/default template. The
round-trip payload for each named agent lives in that agent's own
`agent_config.json`.

## Runtime Reload Contract

The runtime must reflect template changes in two layers:

- Prompt content (`AGENT.md` body and `SOUL.md`) is read by the context builder.
- Agent instance fields derived from frontmatter and behavior (`model`, skills,
  tool allowlists, and `behavior.json`) require a registry/config reload.

`/reload` and `ReloadProviderAndConfig` must rebuild the active agent registry so
that updated frontmatter, skills/model, `SOUL.md`, and `behavior.json` are used
by future turns.

## Behavior Rules

`behavior.json` is intentionally split across enforcement layers:

- `pkg/channels` applies cheap, message-local hard filters before publishing to
  the bus:
  - `master_enabled`
  - `respond_in_dm`
  - `respond_in_groups`
  - `group_mention_only`
  - `keyword_trigger`
  - `ignore_other_bots`
  - `ignore_forwarded_messages`
  - `ignore_self_messages`
  - media type gates and `max_media_size_mb`
- `pkg/agent` applies session-aware rules after routing:
  - `business_hours_only` and `out_of_hours_reply`
  - `outbound_only_mode`
  - `max_messages_per_session`
  - per-user rate limit and cooldown
  - PII masking on replies
  - handoff keyword event emission

In a multi-agent configuration, channel-layer behavior lookup resolves the
`agents.dispatch.rules` route before applying these cheap filters. This keeps a
routed agent's `behavior.json` effective at ingress instead of accidentally
using the default agent's behavior for every channel message.

If `behavior.json` is missing or invalid, the runtime falls back to legacy-safe
defaults: enabled master switch, DM/group responses enabled, media processing
enabled, and no throttles. This preserves existing agents that predate the
template behavior system.

For the current live agent, these flags are intentional and must be preserved
unless explicitly changed from the dashboard:

```json
{
  "master_enabled": false,
  "respond_in_dm": false,
  "respond_in_groups": false
}
```

Do not "fix" these by enabling the live agent during maintenance. They are
business state, not a code defect.

## Gateway Readiness Rule

Gateway health has two endpoints:

- `/health` reports that the process is alive.
- `/ready` reports that the shared channel HTTP server is ready to accept
  channel/runtime traffic.

The shared `health.Server` must be marked:

- not ready during setup, stop, and reload transitions;
- ready only after channels have started successfully;
- not ready again before services stop/reload.

This prevents `/health` from masking a runtime that is alive but not yet ready.

## Current Live State

As of the latest maintenance pass:

- Live workspace: `/root/.picoclaw/workspace`
- Applied template: `atendente-geral`
- Template files last written: `2026-05-15 21:46:10 +0200`
- Gateway binary: `/usr/local/bin/picoclaw`
- Gateway service owner: `picoclaw-launcher.service`
- `/health`: OK
- `/ready`: ready after the readiness fix and service restart

The previous binary was backed up during deployment before replacement.

## Regression Tests

The following tests guard the contract:

```sh
go test ./web/backend/api -run 'TestApplyAgentTemplate|TestTemplateOverrides'
go test ./pkg/agent -run 'TestLoadAgentDefinition|TestNewAgentInstance_UsesFrontmatterModelAndSkills|TestStructuredAgentUserChangesInvalidateCache|TestLoadBehavior|TestBehavior|TestReloadProviderAndConfig|TestBehaviorProviderUsesRoutedAgentBehavior'
go test ./pkg/channels -run 'Test.*Behavior|Test.*Filter|TestSharedHealthReadyTracksManagerLifecycle'
go test -tags goolm,stdjson ./pkg/health ./pkg/gateway -run 'TestReady|TestShared|TestPublishGatewayEvent|TestShutdownGatewayClosesMessageBus'
cd web/frontend && pnpm exec tsc -b --pretty false
```

The gateway package needs the project build tags `goolm,stdjson` in this
environment to avoid the external C `libolm` dependency path.
