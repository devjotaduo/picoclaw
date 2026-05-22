import { launcherFetch } from "@/api/http"
import type {
  TemplateApplyPayload,
  TemplateApplyResponse,
  TemplateSkillConfig,
} from "@/components/agent/templates/types"

export interface TemplateOverride {
  skill_configs?: TemplateSkillConfig[]
  draft?: TemplateApplyPayload
}

export interface TemplateOverridesResponse {
  overrides: Record<string, TemplateOverride>
}

export interface TemplateOverrideSaveResponse {
  status: string
  template_id: string
  override: TemplateOverride
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const raw = await res.text()
    if (raw.trim() === "") {
      return `API error: ${res.status} ${res.statusText}`
    }
    try {
      const body = JSON.parse(raw) as { error?: string; errors?: string[] }
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        return body.errors.join("; ")
      }
      if (typeof body.error === "string" && body.error.trim() !== "") {
        return body.error
      }
    } catch {
      return raw.trim()
    }
  } catch {
    // ignore invalid body
  }
  return `API error: ${res.status} ${res.statusText}`
}

export async function applyAgentTemplate(
  payload: TemplateApplyPayload,
): Promise<TemplateApplyResponse> {
  const res = await launcherFetch("/api/agent/templates/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateApplyResponse>
}

export async function getTemplateOverrides(): Promise<TemplateOverridesResponse> {
  const res = await launcherFetch("/api/agent/templates/overrides")
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateOverridesResponse>
}

export async function saveTemplateOverride(
  templateId: string,
  override: TemplateOverride,
): Promise<TemplateOverrideSaveResponse> {
  const res = await launcherFetch(
    `/api/agent/templates/overrides/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(override),
    },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateOverrideSaveResponse>
}

export interface AgentConfigResponse {
  configured: boolean
  payload?: TemplateApplyPayload
  applied_at?: number
}

export interface AgentSummary {
  id: string
  name?: string
  avatar?: {
    type?: "preset" | "image" | string
    icon?: string
    initials?: string
    background?: string
    foreground?: string
    image_url?: string
  }
  role_config?: {
    version?: number
    kind?: string
    description?: string
    profile?: Record<string, unknown>
    marketing?: {
      platforms?: string[]
      deliverables?: string[]
      approval_mode?: string
      public_publish_dir?: string
      requires_human_review?: boolean
    }
    sales?: Record<string, unknown>
    attendant?: Record<string, unknown>
    assistant?: Record<string, unknown>
  }
  default: boolean
  active: boolean
  workspace: string
  configured?: boolean
  template_id?: string
  applied_at?: number
  model?: string
  skills?: string[]
}

export interface AgentAccessConfig {
  panel_enabled?: boolean
  panel_roles?: string[]
  whatsapp_direct_enabled?: boolean
  whatsapp_allowed_senders?: string[]
  whatsapp_allowed_chats?: string[]
}

export interface AgentEditorPromptState {
  configured: boolean
  template_id?: string
  applied_at?: number
  model?: string
  skills?: string[]
  payload?: TemplateApplyPayload
}

export interface AgentEditorAgent extends AgentSummary {
  name: string
  allowed: boolean
  access?: AgentAccessConfig
  subagents?: {
    allow_agents?: string[]
  }
  prompt: AgentEditorPromptState
}

export interface AgentEditorStateResponse {
  role: string
  agents: AgentEditorAgent[]
  main_agent_id: string
  main_allow_agents: string[]
  admin_whatsapp_jids: string[]
  assistant_whatsapp_jids?: string[]
  assistant_whatsapp_chats?: string[]
}

export interface AgentsResponse {
  agents: AgentSummary[]
}

export interface CreateAgentInput {
  id: string
  name: string
  avatar?: AgentSummary["avatar"]
  default?: boolean
}

export interface UpdateAgentInput {
  name?: string
  avatar?: AgentSummary["avatar"]
  default?: boolean
  active?: boolean
}

export async function getAgentConfig(
  agentId?: string,
): Promise<AgentConfigResponse> {
  const path =
    agentId && agentId.trim() !== ""
      ? `/api/agent/config?agent_id=${encodeURIComponent(agentId)}`
      : "/api/agent/config"
  const res = await launcherFetch(path)
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentConfigResponse>
}

export async function listAgents(): Promise<AgentsResponse> {
  const res = await launcherFetch("/api/agents")
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentsResponse>
}

export async function getAgentEditorState(): Promise<AgentEditorStateResponse> {
  const res = await launcherFetch("/api/agent/editor-state")
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentEditorStateResponse>
}

export async function createAgent(
  input: CreateAgentInput,
): Promise<AgentSummary> {
  const res = await launcherFetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentSummary>
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentSummary> {
  const res = await launcherFetch(
    `/api/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentSummary>
}

export async function deleteAgent(
  agentId: string,
): Promise<{ status: string; agent_id: string }> {
  const res = await launcherFetch(
    `/api/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<{ status: string; agent_id: string }>
}

export async function resetTemplateOverride(
  templateId: string,
): Promise<{ status: string; template_id: string }> {
  const res = await launcherFetch(
    `/api/agent/templates/overrides/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<{ status: string; template_id: string }>
}
