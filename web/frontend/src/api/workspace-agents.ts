import { launcherFetch } from "@/api/http"

export interface WorkspaceAgent {
  id: string
  name: string
  role: string
  visibility?: string
  summary?: string
  path: string
  content?: string
}

export interface WorkspaceAgentsResponse {
  workspace: string
  agents: WorkspaceAgent[]
}

export interface WorkspaceAgentDetail extends WorkspaceAgent {
  content: string
}

async function extractWorkspaceAgentError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function getWorkspaceAgents(): Promise<WorkspaceAgentsResponse> {
  const res = await launcherFetch("/api/workspace/agents")
  if (!res.ok) {
    throw new Error(await extractWorkspaceAgentError(res))
  }
  return res.json() as Promise<WorkspaceAgentsResponse>
}

export async function getWorkspaceAgent(
  id: string,
): Promise<WorkspaceAgentDetail> {
  const res = await launcherFetch(
    `/api/workspace/agents/${encodeURIComponent(id)}/raw`,
  )
  if (!res.ok) {
    throw new Error(await extractWorkspaceAgentError(res))
  }
  return res.json() as Promise<WorkspaceAgentDetail>
}
