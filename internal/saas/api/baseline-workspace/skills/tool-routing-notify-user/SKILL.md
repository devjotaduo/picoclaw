---
name: tool-routing-notify-user
description: Decide whether to use `notify_user` versus delegation, spawning, scheduling, or normal replies when a request involves notifying the user, asking another agent to act, or waiting for agent/task events.
---
# Tool Routing for `notify_user`

Use this skill when a request mentions `notify_user` or implies one of these choices:
- show a short notice in the user panel
- ask another agent to do work
- wait for or monitor an agent event such as heartbeat or task completion
- schedule a reminder or time-based follow-up

## What `notify_user` is for

`notify_user` is only for creating a short card or notice in the user's panel.

Use `notify_user` when the goal is to:
- alert the user about something
- surface a short asynchronous update
- post a concise warning, info message, or status note

Typical examples:
- billing alert
- lead warning
- short KPI update
- quick asynchronous status note

## What `notify_user` is not for

Do not use `notify_user` to:
- call another agent
- assign work to another agent
- delegate execution
- spawn a subtask or worker
- wait for the next heartbeat from an agent
- monitor internal agent lifecycle events
- orchestrate a multi-step internal workflow

If the user asks for any of those, route to the appropriate mechanism instead.

## Routing decision process

Follow these steps exactly:

1. Read the user request and identify the real intent.
   - If the intent is "show me a short notice in the panel," consider `notify_user`.
   - If the intent is "make another agent do something," do not use `notify_user`.
   - If the intent is "wait until an agent event happens," do not use `notify_user`.
   - If the intent is "remind me later" or "run later," do not use `notify_user` as the primary mechanism.

2. Classify the request into one of these buckets:
   - Panel communication
   - Delegation or subtask execution
   - Event waiting or monitoring
   - Time-based scheduling
   - Plain conversational answer

3. Choose the action:
   - Panel communication -> use `notify_user`
   - Delegation or subtask execution -> use `delegate` or `spawn`
   - Event waiting or monitoring -> use the agent/task monitoring flow or other appropriate subflow
   - Time-based scheduling -> use `cron` or another scheduling mechanism
   - Plain conversational answer -> respond normally without `notify_user`

4. If the user explicitly asks whether `notify_user` can delegate or wait on heartbeat/events, answer clearly that it cannot.

5. If helpful, give the correct alternative in the same response.

## Response rules

When explaining the distinction, state it plainly:
- `notify_user`: communicates to the user via panel card
- `delegate` / `spawn`: asks another agent to do work
- `cron`: handles later or scheduled execution
- monitoring subflow: waits for or reacts to agent/task events

Avoid ambiguous phrasing like "maybe" or "sort of works." If the request is for delegation or waiting on events, the answer is no.

## Example mappings

### Use `notify_user`
Request:
- "Notify me in the panel when a hot lead arrives."

Action:
- create a short panel notification

### Do not use `notify_user` for delegation
Request:
- "Ask Rafael to summarize the conversation."

Action:
- use `delegate` or `spawn`

### Do not use `notify_user` for waiting on heartbeat
Request:
- "Wait for Rafael's next heartbeat."

Action:
- use an agent-event monitoring or task workflow, not `notify_user`

### Do not use `notify_user` as the scheduler
Request:
- "Remind me tomorrow morning."

Action:
- schedule with `cron`; optionally send a notification when the scheduled event fires

## Output pattern for explanatory answers

When the user asks conceptually what `notify_user` is for, answer in this structure:

1. One-sentence definition:
   - "`notify_user` is only for a short panel notice to the user."

2. One-sentence limitation:
   - "It does not delegate work, call another agent, or wait for heartbeat/events."

3. Correct alternatives:
   - delegation -> `delegate` or `spawn`
   - waiting/monitoring -> monitoring flow or task subflow
   - scheduling -> `cron`

4. Optional concrete examples.

## Preferred style

Be direct and operational. Prefer short corrective guidance such as:
- "No. `notify_user` only posts a short card in the user panel."
- "If you want Rafael to do work, use `delegate` or `spawn`."
- "If you need to wait for heartbeat or task events, use the appropriate monitoring flow, not `notify_user`."

## Audit notes

Source task evidence consistently showed the learned rule:
- `notify_user` is for a short panel card
- not for asking another agent to act
- not for waiting on heartbeat or internal agent events
- delegation should use `delegate` or `spawn`
- time-based follow-up may use `cron`

## Proposed append

Add the following subsection near the routing examples and execution steps:

### Direct status-registration requests
Use `notify_user` immediately when the user explicitly asks to use `notify_user` now to register or post an important status change in the panel, and the requested action is only to create a short notice card.

Typical trigger patterns:
- "use notify_user now to register an important status update"
- "notify the user that X has just been completed"
- "post in the panel that the company registration was completed"
- "register this update now"

Treat these as a straight notification task when all of the following are true:
1. The user explicitly wants a panel notification or mentions `notify_user`.
2. The content is a short status update, not a request to make another agent do work.
3. No waiting, monitoring, scheduling, or multi-step orchestration is needed.
4. The message can be expressed as a concise title plus short body text.

Execution process:
1. Identify the event that changed state right now.
2. Convert it into a short user-facing notification.
3. Use a concise title that names the completed event.
4. Use brief body text that states the status change clearly.
5. Send the notification with an informational/data-style type when it is a normal successful status update.
6. After calling the tool, confirm succinctly that the update was registered.

Recommended message construction:
- Title: short noun phrase naming the event, for example `Cadastro da empresa concluído`.
- Body text: one sentence stating the successful completion, for example `O cadastro da empresa foi concluído com sucesso agora.`
- Type: informational/data-style classification for routine status updates.

Do not reroute away from `notify_user` in this case unless the user is actually asking for one of these instead:
- delegate work to another agent
- wait for a future event
- monitor heartbeat/task lifecycle
- schedule a reminder
- perform a longer workflow beyond posting the notice

Example outcome:
- User request: use `notify_user` now to register that the company registration has just been completed
- Correct action: call `notify_user`
- Suitable notification:
  - Title: `Cadastro da empresa concluído`
  - Text: `O cadastro da empresa foi concluído com sucesso agora.`
  - Type: `data`

Concise provenance for review:
- Source task evidence showed two successful turns where the correct behavior was to immediately register a panel notification for a just-completed company registration.
- This pattern fits the existing skill’s purpose exactly, so an append to `tool-routing-notify-user` is preferred over creating a new skill.