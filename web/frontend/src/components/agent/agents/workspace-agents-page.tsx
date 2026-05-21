import {
  IconArrowUp,
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
import {
  type CSSProperties,
  type ComponentType,
  type FormEvent,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
  type WorkspaceAgent,
  type WorkspaceAgentDetail,
  getWorkspaceAgents,
} from "@/api/workspace-agents"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [startedPrompts, setStartedPrompts] = useState<Record<string, string>>(
    {},
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

  const handleDraftChange = (agentID: string, value: string) => {
    setDrafts((current) => ({ ...current, [agentID]: value }))
  }

  const handleStart = (agent: WorkspaceAgent, prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      return
    }
    setStartedPrompts((current) => ({ ...current, [agent.id]: trimmed }))
    setDrafts((current) => ({ ...current, [agent.id]: "" }))
  }

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
                  draft={drafts[agent.id] ?? ""}
                  startedPrompt={startedPrompts[agent.id] ?? ""}
                  onDraftChange={(value) => handleDraftChange(agent.id, value)}
                  onStart={(prompt) => handleStart(agent, prompt)}
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
  draft,
  startedPrompt,
  onDraftChange,
  onStart,
  onOpen,
}: {
  agent: WorkspaceAgent
  index: number
  draft: string
  startedPrompt: string
  onDraftChange: (value: string) => void
  onStart: (prompt: string) => void
  onOpen: () => void
}) {
  const palette = agentPalettes[index % agentPalettes.length]
  const paletteStyle = {
    "--agent-accent": palette.accent,
    "--agent-strong": palette.strong,
    "--agent-soft": palette.soft,
  } as CSSProperties
  const quickActions = getAgentQuickActions(agent)

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onStart(draft)
  }

  return (
    <article
      style={paletteStyle}
      className="border-border/70 bg-card text-card-foreground relative flex min-h-[252px] flex-col overflow-hidden rounded-lg border p-4 shadow-sm transition duration-200 hover:border-[color-mix(in_oklab,var(--agent-accent)_28%,var(--border))] hover:shadow-md"
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

        <div className="flex flex-wrap gap-1.5">
          {quickActions.slice(0, 2).map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              className="border-border/70 bg-muted/25 text-foreground hover:border-border hover:bg-muted/45 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition"
              onClick={() => onStart(label)}
            >
              <Icon className="text-muted-foreground size-4" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-1.5 px-1">
            <span className="bg-muted-foreground/35 size-2 rounded-full" />
            <span className="bg-muted-foreground/20 size-2 rounded-full" />
            <span className="bg-muted-foreground/10 size-2 rounded-full" />
          </div>

          {startedPrompt ? (
            <div className="bg-muted/35 text-muted-foreground line-clamp-1 rounded-lg px-3 py-2 text-sm leading-5">
              <span className="text-foreground font-medium">{agent.name}</span>{" "}
              iniciou: {startedPrompt}
            </div>
          ) : null}

          <form
            className="border-border/70 bg-muted/20 flex items-center gap-2 rounded-lg border px-2 py-1 transition focus-within:border-[color-mix(in_oklab,var(--agent-accent)_34%,var(--border))]"
            onSubmit={submitDraft}
          >
            <Input
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="Iniciar ação..."
              className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              aria-label={`Iniciar ação com ${agent.name}`}
            />
            <Button
              type="submit"
              size="icon-xs"
              disabled={!draft.trim()}
              aria-label={`Iniciar ação com ${agent.name}`}
            >
              <IconArrowUp className="size-3.5" />
            </Button>
          </form>
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
          className="border-border bg-card/70 h-[252px] animate-pulse rounded-lg border"
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
