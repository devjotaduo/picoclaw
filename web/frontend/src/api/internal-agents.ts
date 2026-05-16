import { launcherFetch } from "@/api/http"

export interface AgentAccessConfig {
  panel_enabled?: boolean
  panel_roles?: string[]
  whatsapp_direct_enabled?: boolean
  whatsapp_allowed_senders?: string[]
}

export interface AgentSummary {
  id: string
  name: string
  workspace?: string
  default?: boolean
  allowed: boolean
  access?: AgentAccessConfig
  subagents?: {
    allow_agents?: string[]
  }
}

export interface InternalAgentsResponse {
  role: string
  agents: AgentSummary[]
  main_allow_agents: string[]
  admin_whatsapp_jids: string[]
}

export interface AgentTurnResponse {
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
  payload: Pick<
    InternalAgentsResponse,
    "main_allow_agents" | "admin_whatsapp_jids"
  >,
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
