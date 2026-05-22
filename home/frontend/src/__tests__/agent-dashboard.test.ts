import { describe, expect, it } from "vitest"

import type { AgentDashboardItem } from "@/api/agent-dashboard"
import {
  actionableDashboardItems,
  dashboardArtifactLabel,
  dashboardPriorityLabel,
  dashboardStatusLabel,
  friendlyDashboardText,
  friendlyTaskSchedule,
  friendlyTaskTitle,
  normalizeAgentDashboardResponse,
  recentDashboardItems,
} from "@/lib/agent-dashboard"

describe("agent dashboard helpers", () => {
  it("keeps only actionable items", () => {
    const items = [
      item("a", "pending"),
      item("b", "done"),
      item("c", "scheduled"),
      item("d", "dismissed"),
    ]

    expect(actionableDashboardItems(items).map((entry) => entry.id)).toEqual([
      "a",
      "c",
    ])
  })

  it("orders recent items by updated timestamp", () => {
    const items = [
      item("old", "done", "2026-05-20T10:00:00Z"),
      item("new", "done", "2026-05-20T12:00:00Z"),
    ]

    expect(recentDashboardItems(items, 1)[0].id).toBe("new")
  })

  it("formats labels used by the dashboard", () => {
    expect(dashboardStatusLabel("in_progress")).toBe("Em andamento")
    expect(dashboardPriorityLabel("high")).toBe("Alta")
  })

  it("normalizes null API arrays before rendering", () => {
    const normalized = normalizeAgentDashboardResponse({
      generated_at: "2026-05-20T12:00:00Z",
      metrics: null,
      agents: null,
      items: null,
      tasks: null,
      health: {
        missing_sources: null,
        errors: null,
        updated_at: "2026-05-20T12:00:00Z",
      },
    })

    expect(normalized.metrics.alerts).toBe(0)
    expect(normalized.agents).toEqual([])
    expect(normalized.items).toEqual([])
    expect(normalized.tasks).toEqual([])
    expect(normalized.artifacts).toEqual([])
    expect(normalized.health.missing_sources).toEqual([])
    expect(normalized.health.errors).toEqual([])
  })

  it("renders technical task and item data as user-friendly text", () => {
    expect(
      friendlyTaskTitle({
        id: "marketing-monthly-positioning",
        title: "marketing-monthly-positioning",
        status: "scheduled",
        source: "workspace/cron/jobs.json",
      }),
    ).toBe("Preparar posicionamento mensal de marketing")
    expect(friendlyTaskSchedule("0 9 1 * *")).toBe("Todo mês, dia 1, às 09:00")
    expect(
      friendlyDashboardText(
        "Remover campo no frontend empresa-setup-dialog.tsx e workspace/memory/melhorias.md",
      ),
    ).not.toContain("workspace/")
    expect(dashboardArtifactLabel("site")).toBe("Site")
  })
})

function item(
  id: string,
  status: AgentDashboardItem["status"],
  updatedAt?: string,
): AgentDashboardItem {
  return {
    id,
    type: "suggestion",
    status,
    title: id,
    source: "test",
    updated_at: updatedAt,
  }
}
