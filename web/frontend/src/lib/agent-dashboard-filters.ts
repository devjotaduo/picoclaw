import type {
  AgentDashboardArtifact,
  AgentDashboardItem,
  AgentDashboardStatus,
  AgentDashboardTask,
} from "@/api/agent-dashboard"
import {
  type AgentDashboardWorkSummary,
  friendlyAgentName,
  friendlyTaskTitle,
  isActionableDashboardStatus,
} from "@/lib/agent-dashboard"

export type DashboardStatusFilter = "all" | "actionable" | "done" | "waiting"
export type DashboardSourceFilter =
  | "all"
  | "whatsapp"
  | "output"
  | "reports"
  | "plans"
  | "cron"
  | "tests"

export interface DashboardFilters {
  query: string
  agentId: string
  status: DashboardStatusFilter
  source: DashboardSourceFilter
}

export const ALL_FILTER = "all"

export function filterAgentWorkSummaries(
  summaries: AgentDashboardWorkSummary[],
  filters: DashboardFilters,
) {
  return summaries.filter((summary) => {
    if (
      filters.agentId !== ALL_FILTER &&
      summary.agent.id !== filters.agentId
    ) {
      return false
    }
    if (!dashboardSummaryMatchesStatus(summary, filters.status)) {
      return false
    }
    if (!dashboardSummaryMatchesSource(summary, filters.source)) {
      return false
    }
    if (!filters.query.trim()) {
      return true
    }
    return dashboardTextMatchesQuery(
      [
        friendlyAgentName(summary.agent),
        summary.agent.role,
        summary.latest_title,
        ...summary.items.flatMap((item) => [
          item.title,
          item.summary,
          item.source,
        ]),
        ...summary.tasks.flatMap((task) => [task.title, task.source]),
        ...summary.artifacts.flatMap((artifact) => [
          artifact.title,
          artifact.source,
        ]),
      ],
      filters.query,
    )
  })
}

export function dashboardItemMatchesFilters(
  item: AgentDashboardItem,
  filters: DashboardFilters,
) {
  if (!dashboardStatusMatchesFilter(item.status, filters.status)) {
    return false
  }
  if (!dashboardEntryMatchesSource(item, filters.source)) {
    return false
  }
  return dashboardTextMatchesQuery(
    [item.title, item.summary, item.source, item.agent_name, item.agent_id],
    filters.query,
  )
}

export function dashboardTaskMatchesFilters(
  task: AgentDashboardTask,
  filters: DashboardFilters,
) {
  if (!dashboardStatusMatchesFilter(task.status, filters.status)) {
    return false
  }
  if (!dashboardEntryMatchesSource(task, filters.source)) {
    return false
  }
  return dashboardTextMatchesQuery(
    [
      friendlyTaskTitle(task),
      task.title,
      task.source,
      task.schedule,
      task.agent_name,
      task.agent_id,
    ],
    filters.query,
  )
}

export function dashboardArtifactMatchesFilters(
  artifact: AgentDashboardArtifact,
  filters: DashboardFilters,
) {
  if (filters.status === "actionable" || filters.status === "waiting") {
    return false
  }
  if (!dashboardEntryMatchesSource(artifact, filters.source)) {
    return false
  }
  return dashboardTextMatchesQuery(
    [artifact.title, artifact.source, artifact.agent_name, artifact.agent_id],
    filters.query,
  )
}

function dashboardSummaryMatchesStatus(
  summary: AgentDashboardWorkSummary,
  status: DashboardStatusFilter,
) {
  if (status === "all") {
    return true
  }
  if (status === "waiting") {
    return summary.total === 0
  }
  if (status === "actionable") {
    return summary.pending > 0
  }
  return summary.total > 0 && summary.pending === 0
}

function dashboardSummaryMatchesSource(
  summary: AgentDashboardWorkSummary,
  source: DashboardSourceFilter,
) {
  if (source === "all") {
    return true
  }
  return (
    summary.items.some((item) => dashboardEntryMatchesSource(item, source)) ||
    summary.tasks.some((task) => dashboardEntryMatchesSource(task, source)) ||
    summary.artifacts.some((artifact) =>
      dashboardEntryMatchesSource(artifact, source),
    )
  )
}

function dashboardStatusMatchesFilter(
  status: AgentDashboardStatus,
  filter: DashboardStatusFilter,
) {
  if (filter === "all") {
    return true
  }
  if (filter === "actionable") {
    return isActionableDashboardStatus(status)
  }
  if (filter === "done") {
    return status === "done" || status === "implemented"
  }
  return false
}

function dashboardEntryMatchesSource(
  entry: { source?: string; type?: string },
  filter: DashboardSourceFilter,
) {
  if (filter === "all") {
    return true
  }
  const source = String(entry.source || "").toLowerCase()
  const type = String(entry.type || "").toLowerCase()
  switch (filter) {
    case "whatsapp":
      return source.includes("whatsapp")
    case "output":
      return source.includes("workspace/output")
    case "reports":
      return (
        source.includes("relatorio") ||
        source.includes("relatórios") ||
        source.includes("reports") ||
        ["analysis", "report", "metric"].includes(type)
      )
    case "plans":
      return source.includes("plans") || type === "task"
    case "cron":
      return source.includes("cron")
    case "tests":
      return source.includes("workspace/tests")
    default:
      return true
  }
}

function dashboardTextMatchesQuery(
  values: Array<string | undefined>,
  query: string,
) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  const haystack = values.filter(Boolean).join(" ").toLowerCase()
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}
