import { launcherFetch } from "@/api/http"
import { normalizeAgentDashboardResponse } from "@/lib/agent-dashboard"

export type AgentDashboardItemType =
  | "result"
  | "analysis"
  | "suggestion"
  | "report"
  | "metric"
  | "task"

export type AgentDashboardStatus =
  | "new"
  | "pending"
  | "in_progress"
  | "scheduled"
  | "implemented"
  | "done"
  | "dismissed"

export interface AgentDashboardMetrics {
  agents: number
  active_agents: number
  pending_items: number
  reports: number
  active_tasks: number
  alerts: number
}

export interface AgentDashboardAgent {
  id: string
  name: string
  role: string
  active: boolean
  item_count: number
  task_count: number
  last_item_at?: string
}

export interface AgentDashboardItem {
  id: string
  type: AgentDashboardItemType
  status: AgentDashboardStatus
  title: string
  summary?: string
  agent_id?: string
  agent_name?: string
  priority?: "critical" | "high" | "medium" | "low" | string
  source: string
  created_at?: string
  updated_at?: string
  due_at?: string
  tags?: string[]
  metrics?: Record<string, string>
  artifacts?: AgentDashboardArtifact[]
}

export interface AgentDashboardTask {
  id: string
  title: string
  status: AgentDashboardStatus
  agent_id?: string
  agent_name?: string
  source: string
  schedule?: string
  next_run_at?: string
  updated_at?: string
}

export interface AgentDashboardHealth {
  missing_sources: string[]
  errors: string[]
  updated_at: string
}

export interface AgentDashboardArtifact {
  id: string
  type: "image" | "document" | "site" | "link" | "service" | "file" | string
  title: string
  source: string
  url: string
  agent_id?: string
  agent_name?: string
  created_at?: string
}

export interface AgentDashboardSavedResponse {
  id: string
  item_id?: string
  item_source?: string
  agent_id?: string
  agent_name?: string
  message: string
  created_at: string
}

export interface AgentDashboardResponse {
  workspace: string
  generated_at: string
  metrics: AgentDashboardMetrics
  agents: AgentDashboardAgent[]
  items: AgentDashboardItem[]
  tasks: AgentDashboardTask[]
  artifacts: AgentDashboardArtifact[]
  health: AgentDashboardHealth
}

export async function getAgentDashboard(): Promise<AgentDashboardResponse> {
  const res = await launcherFetch("/api/agent-dashboard")
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  const payload = (await res.json()) as AgentDashboardResponse
  return normalizeAgentDashboardResponse(payload)
}

export async function postAgentDashboardResponse(input: {
  item_id?: string
  item_source?: string
  agent_id?: string
  agent_name?: string
  message: string
}): Promise<AgentDashboardSavedResponse> {
  const res = await launcherFetch("/api/agent-dashboard/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<AgentDashboardSavedResponse>
}
