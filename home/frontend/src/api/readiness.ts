import { launcherFetch } from "@/api/http"

export type AgentReadinessStatus = "ok" | "partial" | "blocked" | "unknown"

export interface AgentReadiness {
  id: string
  name: string
  role: string
  status: AgentReadinessStatus
  reasons?: string[]
  reads_ok?: string[]
  reads_blocked?: string[]
}

export interface ReadinessResponse {
  workspace: string
  agents: AgentReadiness[]
  summary: { ok: number; partial: number; blocked: number }
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function getReadiness(): Promise<ReadinessResponse> {
  const res = await launcherFetch("/api/workspace/readiness")
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<ReadinessResponse>
}
