import { launcherFetch } from "@/api/http"

interface AgentAccessConfig {
  panel_enabled?: boolean
  panel_roles?: string[]
  whatsapp_direct_enabled?: boolean
  whatsapp_allowed_senders?: string[]
  whatsapp_allowed_chats?: string[]
}

export interface AgentAvatarConfig {
  type?: "preset" | "image" | string
  icon?: string
  initials?: string
  background?: string
  foreground?: string
  image_url?: string
}

export interface AgentSummary {
  id: string
  name: string
  avatar?: AgentAvatarConfig
  workspace?: string
  default?: boolean
  allowed: boolean
  access?: AgentAccessConfig
  subagents?: {
    allow_agents?: string[]
  }
  role_config?: Record<string, unknown>
}

export interface InternalAgentsResponse {
  role: string
  agents: AgentSummary[]
  main_agent_id: string
  main_allow_agents: string[]
  admin_whatsapp_jids: string[]
  assistant_whatsapp_jids?: string[]
  assistant_whatsapp_chats?: string[]
}

export interface UpdateInternalAgentOrchestrationPayload {
  main_agent_id?: string
  main_allow_agents?: string[]
  admin_whatsapp_jids?: string[]
  assistant_whatsapp_jids?: string[]
  assistant_whatsapp_chats?: string[]
  agent_access?: Record<string, AgentAccessConfig>
  agent_profiles?: Record<
    string,
    {
      name?: string
      avatar?: AgentAvatarConfig
    }
  >
  agent_role_configs?: Record<string, Record<string, unknown>>
}

interface AgentTurnResponse {
  agent_id: string
  session_id: string
  content: string
}

export async function getInternalAgents(): Promise<InternalAgentsResponse> {
  const res = await launcherFetch("/api/internal-agents")
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<InternalAgentsResponse>
}

export async function updateInternalAgentOrchestration(
  payload: UpdateInternalAgentOrchestrationPayload,
): Promise<InternalAgentsResponse> {
  const res = await launcherFetch("/api/internal-agents/orchestration", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<InternalAgentsResponse>
}

export async function sendInternalAgentTurn(
  agentID: string,
  content: string,
  sessionID?: string,
): Promise<AgentTurnResponse> {
  const res = await launcherFetch(`/api/internal-agents/${agentID}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, session_id: sessionID }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(data?.error || `API error: ${res.status}`)
  }
  return res.json() as Promise<AgentTurnResponse>
}

export async function getInternalAgentProposals(
  agentID: string,
): Promise<unknown[]> {
  const res = await launcherFetch(`/api/internal-agents/${agentID}/proposals`)
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<unknown[]>
}
