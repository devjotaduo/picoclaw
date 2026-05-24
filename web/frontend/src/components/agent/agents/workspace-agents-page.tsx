import {
  IconBolt,
  IconBulb,
  IconClipboardList,
  IconDots,
  IconLayoutGrid,
  IconLoader2,
  IconMessageCircle,
  IconRobot,
  IconUsersGroup,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, type ComponentType, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type WorkspaceAgent,
  type WorkspaceAgentDetail,
  getWorkspaceAgents,
} from "@/api/workspace-agents"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

import { WorkspaceAgentDetailSheet } from "./workspace-agent-detail-sheet"

const agentPalettes = [
  {
    accent: "var(--accent-blue)",
    strong: "var(--accent-blue-strong)",
    soft: "var(--accent-blue-soft)",
  },
  {
    accent: "var(--accent-pro-violet)",
    strong: "var(--accent-pro-violet-strong)",
    soft: "var(--accent-pro-violet-soft)",
  },
  {
    accent: "var(--success)",
    strong: "var(--success)",
    soft: "var(--success-soft)",
  },
  {
    accent: "var(--warning)",
    strong: "color-mix(in oklab, var(--warning) 58%, var(--foreground))",
    soft: "var(--warning-soft)",
  },
  {
    accent: "var(--danger)",
    strong: "var(--danger)",
    soft: "var(--danger-soft)",
  },
]

type QuickAction = {
  label: string
  Icon: ComponentType<{ className?: string }>
}

export function WorkspaceAgentsPage() {
  const { t } = useTranslation()
  const [selectedAgent, setSelectedAgent] = useState<WorkspaceAgent | null>(
    null,
  )
  const agentsQuery = useQuery({
    queryKey: ["workspace-agents"],
    queryFn: getWorkspaceAgents,
  })
  const agents = agentsQuery.data?.agents ?? []
  const selectedAgentDetail: WorkspaceAgentDetail | undefined =
    selectedAgent?.content !== undefined
      ? { ...selectedAgent, content: selectedAgent.content }
      : undefined

  return (
    <div className="bg-background flex h-full flex-col">
      <PageHeader title={t("navigation.agent_editor", "Agentes")} />

      <div className="flex-1 overflow-auto px-6 py-6 pb-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <IconUsersGroup className="size-4" />
                <span>workspace/agents</span>
              </div>
            </div>
            {agentsQuery.isFetching ? (
              <IconLoader2 className="text-muted-foreground size-4 animate-spin" />
            ) : null}
          </section>

          {agentsQuery.isLoading ? (
            <AgentsSkeleton />
          ) : agentsQuery.isError ? (
            <div className="border-destructive/25 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
              Não foi possível carregar os agentes do workspace.
            </div>
          ) : agents.length === 0 ? (
            <div className="border-border bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm">
              Nenhum agente encontrado em workspace/agents.
            </div>
          ) : (
            <div className="grid w-full grid-cols-[minmax(0,360px)] justify-start gap-4 sm:grid-cols-[repeat(auto-fit,minmax(280px,340px))]">
              {agents.map((agent, index) => (
                <AgentMiniChatCard
                  key={agent.id}
                  agent={agent}
                  index={index}
                  onOpen={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <WorkspaceAgentDetailSheet
        open={selectedAgent !== null}
        selectedAgent={selectedAgent}
        selectedAgentDetail={selectedAgentDetail}
        isLoading={false}
        error={null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAgent(null)
          }
        }}
      />
    </div>
  )
}

function AgentMiniChatCard({
  agent,
  index,
  onOpen,
}: {
  agent: WorkspaceAgent
  index: number
  onOpen: () => void
}) {
  const palette = agentPalettes[index % agentPalettes.length]
  const paletteStyle = {
    "--agent-accent": palette.accent,
    "--agent-strong": palette.strong,
    "--agent-soft": palette.soft,
  } as CSSProperties
  const quickActions = getAgentQuickActions(agent)

  return (
    <article
      style={paletteStyle}
      className="border-border/70 bg-card text-card-foreground relative flex min-h-[184px] flex-col overflow-hidden rounded-lg border p-4 shadow-sm transition duration-200 hover:border-[color-mix(in_oklab,var(--agent-accent)_28%,var(--border))] hover:shadow-md"
    >
      <div className="absolute top-3 right-3 z-10">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Abrir Markdown de ${agent.name}`}
          onClick={onOpen}
        >
          <IconDots className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-4 pr-9">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--agent-soft)_84%,var(--card))] text-xs font-semibold text-[var(--agent-strong)] ring-1 ring-[color-mix(in_oklab,var(--agent-accent)_32%,var(--border))]">
            {agentInitials(agent.name)}
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-foreground text-base leading-tight font-semibold">
              {agent.name}
            </h3>
            <p className="text-muted-foreground line-clamp-1 text-sm leading-5">
              {agent.role}
            </p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5">
          {quickActions.slice(0, 3).map(({ label, Icon }) => (
            <span
              key={label}
              className="border-border/70 bg-muted/25 text-foreground inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
            >
              <Icon className="text-muted-foreground size-4" />
              <span className="truncate">{label}</span>
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

function AgentsSkeleton() {
  return (
    <div className="grid w-full grid-cols-[minmax(0,360px)] justify-start gap-4 sm:grid-cols-[repeat(auto-fit,minmax(280px,340px))]">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="border-border bg-card/70 h-[184px] animate-pulse rounded-lg border"
        />
      ))}
    </div>
  )
}

function agentInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return "AG"
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function getAgentQuickActions(agent: WorkspaceAgent): QuickAction[] {
  const haystack = stripAccents(
    `${agent.name} ${agent.role} ${agent.visibility ?? ""}`,
  ).toLowerCase()

  if (haystack.includes("suporte") || haystack.includes("pos-venda")) {
    return [
      { label: "Priorizar caso", Icon: IconBolt },
      { label: "Resumir histórico", Icon: IconClipboardList },
      { label: "Chamar responsável", Icon: IconLayoutGrid },
    ]
  }

  if (haystack.includes("venda") || haystack.includes("comercial")) {
    return [
      { label: "Classificar lead", Icon: IconBolt },
      { label: "Preparar follow-up", Icon: IconClipboardList },
      { label: "Sugerir proposta", Icon: IconBulb },
    ]
  }

  if (haystack.includes("humano")) {
    return [
      { label: "Assumir conversa", Icon: IconMessageCircle },
      { label: "Resolver exceção", Icon: IconBolt },
      { label: "Registrar decisão", Icon: IconClipboardList },
    ]
  }

  if (haystack.includes("interno") || haystack.includes("dono")) {
    return [
      { label: "Monitorar operação", Icon: IconRobot },
      { label: "Chamar equipe", Icon: IconLayoutGrid },
      { label: "Gerar resumo", Icon: IconClipboardList },
    ]
  }

  return [
    { label: "Atender fila", Icon: IconMessageCircle },
    { label: "Coletar contexto", Icon: IconClipboardList },
    { label: "Encaminhar demanda", Icon: IconLayoutGrid },
  ]
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}
