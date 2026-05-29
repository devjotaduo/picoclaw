import { describe, expect, it } from "vitest"

import type { AgentDashboardItem } from "@/api/agent-dashboard"
import {
  actionableDashboardItems,
  buildAgentDashboardWorkSummaries,
  dashboardArtifactLabel,
  dashboardPriorityLabel,
  dashboardStatusLabel,
  friendlyDashboardText,
  friendlyTaskSchedule,
  friendlyTaskTitle,
  normalizeAgentDashboardResponse,
  recentDashboardItems,
} from "@/lib/agent-dashboard"
import {
  ALL_FILTER,
  filterAgentWorkSummaries,
} from "@/lib/agent-dashboard-filters"

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

  it("groups reports, plans and files by agent", () => {
    const summaries = buildAgentDashboardWorkSummaries({
      agents: [
        {
          id: "camila-suporte",
          name: "Camila",
          role: "Suporte",
          active: true,
          item_count: 0,
          task_count: 0,
        },
        {
          id: "lia",
          name: "Lia",
          role: "Marketing",
          active: true,
          item_count: 0,
          task_count: 0,
        },
        {
          id: "rafael-assistente-interno",
          name: "Rafael",
          role: "Assistente interno",
          active: true,
          item_count: 0,
          task_count: 0,
        },
        {
          id: "catarina",
          name: "Catarina",
          role: "Curadoria",
          active: true,
          item_count: 0,
          task_count: 0,
        },
      ],
      items: [
        {
          id: "report",
          type: "report",
          status: "done",
          title: "Relatório de campanha",
          source: "workspace/output/reports/lia.md",
          agent_id: "lia",
          agent_name: "Lia",
          updated_at: "2026-05-28T12:00:00Z",
        },
      ],
      tasks: [
        {
          id: "plan",
          title: "Plano de aprofundamento",
          status: "in_progress",
          source: "workspace/output/plans/catarina.md",
          agent_id: "catarina",
          agent_name: "Catarina",
        },
        {
          id: "analytics",
          title: "Analytics — Relatório diário",
          status: "scheduled",
          source: "workspace/cron/jobs.json",
          agent_id: "main",
        },
      ],
      artifacts: [
        {
          id: "file",
          type: "document",
          title: "Arquivo gerado",
          source: "workspace/output/marketing/post.md",
          url: "/api/agent-dashboard/artifacts/output/marketing/post.md",
          agent_id: "lia",
          agent_name: "Lia",
        },
        {
          id: "source-only",
          type: "document",
          title: "Briefing de campanha",
          source: "workspace/output/marketing/briefing.md",
          url: "/api/agent-dashboard/artifacts/output/marketing/briefing.md",
        },
      ],
    })

    const lia = summaries.find((summary) => summary.agent.id === "lia")
    const camila = summaries.find(
      (summary) => summary.agent.id === "camila-suporte",
    )
    const catarina = summaries.find(
      (summary) => summary.agent.id === "catarina",
    )
    const rafael = summaries.find(
      (summary) => summary.agent.id === "rafael-assistente-interno",
    )

    expect(lia?.reports).toBe(1)
    expect(lia?.files).toBe(2)
    expect(camila?.files).toBe(0)
    expect(catarina?.plans).toBe(1)
    expect(catarina?.pending).toBe(1)
    expect(rafael?.plans).toBe(1)
  })

  it("filters multi-agent work by query, status and source", () => {
    const summaries = buildSampleWorkSummaries()

    expect(
      filterAgentWorkSummaries(summaries, {
        query: "campanha",
        agentId: ALL_FILTER,
        status: "all",
        source: "all",
      }).map((summary) => summary.agent.id),
    ).toEqual(["lia"])
    expect(
      filterAgentWorkSummaries(summaries, {
        query: "",
        agentId: ALL_FILTER,
        status: "actionable",
        source: "all",
      }).map((summary) => summary.agent.id),
    ).toEqual(["catarina", "rafael-assistente-interno"])
    expect(
      filterAgentWorkSummaries(summaries, {
        query: "",
        agentId: ALL_FILTER,
        status: "waiting",
        source: "all",
      }).map((summary) => summary.agent.id),
    ).toEqual(["camila-suporte"])
    expect(
      filterAgentWorkSummaries(summaries, {
        query: "",
        agentId: ALL_FILTER,
        status: "all",
        source: "plans",
      }).map((summary) => summary.agent.id),
    ).toEqual(["catarina"])
  })
})

function buildSampleWorkSummaries() {
  return buildAgentDashboardWorkSummaries({
    agents: [
      {
        id: "camila-suporte",
        name: "Camila",
        role: "Suporte",
        active: true,
        item_count: 0,
        task_count: 0,
      },
      {
        id: "lia",
        name: "Lia",
        role: "Marketing",
        active: true,
        item_count: 0,
        task_count: 0,
      },
      {
        id: "rafael-assistente-interno",
        name: "Rafael",
        role: "Assistente interno",
        active: true,
        item_count: 0,
        task_count: 0,
      },
      {
        id: "catarina",
        name: "Catarina",
        role: "Curadoria",
        active: true,
        item_count: 0,
        task_count: 0,
      },
    ],
    items: [
      {
        id: "report",
        type: "report",
        status: "done",
        title: "Relatório de campanha",
        source: "workspace/output/reports/lia.md",
        agent_id: "lia",
        agent_name: "Lia",
        updated_at: "2026-05-28T12:00:00Z",
      },
    ],
    tasks: [
      {
        id: "plan",
        title: "Plano de aprofundamento",
        status: "in_progress",
        source: "workspace/output/plans/catarina.md",
        agent_id: "catarina",
        agent_name: "Catarina",
      },
      {
        id: "analytics",
        title: "Analytics — Relatório diário",
        status: "scheduled",
        source: "workspace/cron/jobs.json",
        agent_id: "main",
      },
    ],
    artifacts: [
      {
        id: "file",
        type: "document",
        title: "Arquivo gerado",
        source: "workspace/output/marketing/post.md",
        url: "/api/agent-dashboard/artifacts/output/marketing/post.md",
        agent_id: "lia",
        agent_name: "Lia",
      },
      {
        id: "source-only",
        type: "document",
        title: "Briefing de campanha",
        source: "workspace/output/marketing/briefing.md",
        url: "/api/agent-dashboard/artifacts/output/marketing/briefing.md",
      },
    ],
  })
}

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
