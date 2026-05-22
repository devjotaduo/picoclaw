import type { AgentEditorAgent } from "@/api/agent-templates"

export type AgentListStatusFilter = "all" | "active" | "inactive"
export type AgentListSort = "name" | "edited" | "default"

export interface AgentListControls {
  search: string
  status: AgentListStatusFilter
  sort: AgentListSort
}

export const DEFAULT_AGENT_LIST_CONTROLS: AgentListControls = {
  search: "",
  status: "all",
  sort: "default",
}

export function applyAgentListControls(
  agents: AgentEditorAgent[],
  controls: AgentListControls,
): AgentEditorAgent[] {
  const filtered = agents.filter((a) => {
    if (controls.status === "active" && a.active === false) return false
    if (controls.status === "inactive" && a.active !== false) return false
    if (controls.search.trim()) {
      const q = controls.search.toLowerCase()
      const hay = `${a.name ?? ""} ${a.id} ${a.template_id ?? ""}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  switch (controls.sort) {
    case "name":
      return [...filtered].sort((a, b) => {
        const na = (a.name || a.id).toLowerCase()
        const nb = (b.name || b.id).toLowerCase()
        return na.localeCompare(nb, "pt-BR")
      })
    case "edited":
      return [...filtered].sort(
        (a, b) => (b.applied_at ?? 0) - (a.applied_at ?? 0),
      )
    case "default":
    default:
      return [...filtered].sort((a, b) => {
        if (a.default && !b.default) return -1
        if (!a.default && b.default) return 1
        return 0
      })
  }
}
