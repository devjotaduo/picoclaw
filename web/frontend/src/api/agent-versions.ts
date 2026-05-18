import { launcherFetch } from "@/api/http"
import type { TemplateApplyPayload } from "@/components/agent/templates/types"

export interface AgentVersion {
  id: string
  agent_id: string
  created_at: number
  label?: string
  author?: string
  payload: TemplateApplyPayload
}

export interface AgentVersionsListResponse {
  versions: AgentVersion[]
}

export interface AgentVersionCreateInput {
  label?: string
  author?: string
  payload: TemplateApplyPayload
}

async function readError(res: Response): Promise<string> {
  try {
    const raw = await res.text()
    if (!raw.trim()) return `${res.status} ${res.statusText}`
    try {
      const parsed = JSON.parse(raw) as { error?: string }
      return parsed.error?.trim() || raw.trim()
    } catch {
      return raw.trim()
    }
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

function encodeAgent(agentID: string): string {
  return encodeURIComponent(agentID)
}

export async function listAgentVersions(
  agentID: string,
): Promise<AgentVersion[]> {
  const res = await launcherFetch(`/api/agents/${encodeAgent(agentID)}/versions`)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const body = (await res.json()) as AgentVersionsListResponse
  return body.versions ?? []
}

export async function createAgentVersion(
  agentID: string,
  input: AgentVersionCreateInput,
): Promise<AgentVersion> {
  const res = await launcherFetch(
    `/api/agents/${encodeAgent(agentID)}/versions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AgentVersion
}

export async function deleteAgentVersion(
  agentID: string,
  versionID: string,
): Promise<void> {
  const res = await launcherFetch(
    `/api/agents/${encodeAgent(agentID)}/versions/${encodeURIComponent(versionID)}`,
    { method: "DELETE" },
  )
  if (!res.ok && res.status !== 204) {
    throw new Error(await readError(res))
  }
}
