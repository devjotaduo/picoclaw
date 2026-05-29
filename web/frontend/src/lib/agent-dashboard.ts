import type {
  AgentDashboardAgent,
  AgentDashboardArtifact,
  AgentDashboardHealth,
  AgentDashboardItem,
  AgentDashboardMetrics,
  AgentDashboardResponse,
  AgentDashboardStatus,
  AgentDashboardTask,
} from "@/api/agent-dashboard"

type AgentDashboardHealthInput = Partial<
  Omit<AgentDashboardHealth, "missing_sources" | "errors">
> & {
  missing_sources?: string[] | null
  errors?: string[] | null
}

type AgentDashboardResponseInput = Partial<
  Omit<
    AgentDashboardResponse,
    "metrics" | "agents" | "items" | "tasks" | "artifacts" | "health"
  >
> & {
  metrics?: Partial<AgentDashboardMetrics> | null
  agents?: AgentDashboardAgent[] | null
  items?: AgentDashboardItem[] | null
  tasks?: AgentDashboardTask[] | null
  artifacts?: AgentDashboardArtifact[] | null
  health?: AgentDashboardHealthInput | null
}

export function isActionableDashboardStatus(status: AgentDashboardStatus) {
  return (
    status === "new" ||
    status === "pending" ||
    status === "in_progress" ||
    status === "scheduled"
  )
}

export function dashboardStatusLabel(status: AgentDashboardStatus) {
  switch (status) {
    case "new":
      return "Novo"
    case "pending":
      return "Pendente"
    case "in_progress":
      return "Em andamento"
    case "scheduled":
      return "Agendado"
    case "implemented":
      return "Implementado"
    case "done":
      return "Concluído"
    case "dismissed":
      return "Arquivado"
    default:
      return status
  }
}

export function dashboardTypeLabel(type: AgentDashboardItem["type"]) {
  switch (type) {
    case "analysis":
      return "Análise"
    case "suggestion":
      return "Sugestão"
    case "report":
      return "Relatório"
    case "metric":
      return "Métrica"
    case "task":
      return "Tarefa"
    case "result":
    default:
      return "Resultado"
  }
}

export function dashboardPriorityLabel(priority?: string) {
  switch (priority) {
    case "critical":
      return "Crítica"
    case "high":
      return "Alta"
    case "medium":
      return "Média"
    case "low":
      return "Baixa"
    default:
      return ""
  }
}

export function dashboardItemStamp(item: AgentDashboardItem) {
  return item.updated_at || item.created_at || item.due_at || ""
}

export function dashboardTaskStamp(task: AgentDashboardTask) {
  return task.next_run_at || task.updated_at || ""
}

export function recentDashboardItems(
  items: AgentDashboardItem[],
  limit: number,
) {
  return [...items]
    .sort((a, b) => dashboardItemStamp(b).localeCompare(dashboardItemStamp(a)))
    .slice(0, limit)
}

export function actionableDashboardItems(items: AgentDashboardItem[]) {
  return items.filter((item) => isActionableDashboardStatus(item.status))
}

export interface AgentDashboardWorkSummary {
  agent: AgentDashboardAgent
  items: AgentDashboardItem[]
  tasks: AgentDashboardTask[]
  artifacts: AgentDashboardArtifact[]
  pending: number
  reports: number
  plans: number
  files: number
  total: number
  latest_at?: string
  latest_title?: string
}

export function buildAgentDashboardWorkSummaries(input: {
  agents: AgentDashboardAgent[]
  items: AgentDashboardItem[]
  tasks: AgentDashboardTask[]
  artifacts: AgentDashboardArtifact[]
}): AgentDashboardWorkSummary[] {
  const summaries = new Map<string, AgentDashboardWorkSummary>()
  const ensureSummary = (agent: AgentDashboardAgent) => {
    const key = agent.id || agent.name || "agent"
    const existing = summaries.get(key)
    if (existing) {
      return existing
    }
    const next: AgentDashboardWorkSummary = {
      agent,
      items: [],
      tasks: [],
      artifacts: [],
      pending: 0,
      reports: 0,
      plans: 0,
      files: 0,
      total: 0,
    }
    summaries.set(key, next)
    return next
  }

  input.agents.forEach((agent) => ensureSummary(agent))
  const unknown = () =>
    ensureSummary({
      id: "__unassigned",
      name: "Sem responsável definido",
      role: "Entrega sem agente associado",
      active: false,
      item_count: 0,
      task_count: 0,
    })

  for (const item of input.items) {
    const summary = findSummaryForAgentEntry(summaries, item) ?? unknown()
    summary.items.push(item)
  }
  for (const task of input.tasks) {
    const summary = findSummaryForAgentEntry(summaries, task) ?? unknown()
    summary.tasks.push(task)
  }
  for (const artifact of input.artifacts) {
    const summary = findSummaryForAgentEntry(summaries, artifact) ?? unknown()
    summary.artifacts.push(artifact)
  }

  for (const summary of summaries.values()) {
    summary.items.sort((a, b) =>
      dashboardItemStamp(b).localeCompare(dashboardItemStamp(a)),
    )
    summary.tasks.sort((a, b) =>
      dashboardTaskStamp(b).localeCompare(dashboardTaskStamp(a)),
    )
    summary.artifacts.sort((a, b) =>
      String(b.created_at || b.id).localeCompare(String(a.created_at || a.id)),
    )

    const reportItems = summary.items.filter((item) =>
      ["analysis", "report", "metric"].includes(item.type),
    )
    const taskItemKeys = summary.items
      .filter((item) => item.type === "task")
      .map((item) => `${item.source}:${item.id}`)
    const taskKeys = new Set([
      ...taskItemKeys,
      ...summary.tasks.map((task) => `${task.source}:${task.id}`),
    ])
    summary.pending =
      summary.items.filter((item) => isActionableDashboardStatus(item.status))
        .length +
      summary.tasks.filter((task) => isActionableDashboardStatus(task.status))
        .length
    summary.reports = reportItems.length
    summary.plans = taskKeys.size
    summary.files = summary.artifacts.length
    summary.total =
      summary.items.length + summary.tasks.length + summary.artifacts.length

    const latest = [
      ...summary.items.map((item) => ({
        at: dashboardItemStamp(item),
        title: item.title,
      })),
      ...summary.tasks.map((task) => ({
        at: dashboardTaskStamp(task),
        title: friendlyTaskTitle(task),
      })),
      ...summary.artifacts.map((artifact) => ({
        at: artifact.created_at || "",
        title: artifact.title,
      })),
    ]
      .filter((entry) => entry.at || entry.title)
      .sort((a, b) => b.at.localeCompare(a.at))[0]
    summary.latest_at = latest?.at
    summary.latest_title = latest?.title
  }

  return [...summaries.values()]
    .filter((summary) => summary.agent.active || summary.total > 0)
    .sort((a, b) => {
      if (a.total > 0 !== b.total > 0) {
        return a.total > 0 ? -1 : 1
      }
      if (a.latest_at || b.latest_at) {
        return String(b.latest_at || "").localeCompare(
          String(a.latest_at || ""),
        )
      }
      if (a.agent.active !== b.agent.active) {
        return a.agent.active ? -1 : 1
      }
      return friendlyAgentName(a.agent).localeCompare(
        friendlyAgentName(b.agent),
      )
    })
}

function findSummaryForAgentEntry(
  summaries: Map<string, AgentDashboardWorkSummary>,
  entry: {
    agent_id?: string
    agent_name?: string
    source?: string
    title?: string
  },
) {
  for (const summary of summaries.values()) {
    if (matchesAgentEntry(summary.agent, entry)) {
      return summary
    }
  }
  return undefined
}

function matchesAgentEntry(
  agent: AgentDashboardAgent,
  entry: {
    agent_id?: string
    agent_name?: string
    source?: string
    title?: string
  },
) {
  const tokens = agentIdentityTokens(agent)
  const directValues = [entry.agent_id, entry.agent_name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
  if (directValues.length > 0) {
    const directMatch = tokens.some((token) =>
      directValues.some(
        (value) => value === token || containsAgentToken(value, token),
      ),
    )
    if (directMatch) {
      return true
    }
    if (!directValues.every((value) => value === "main" || value === "agent")) {
      return false
    }
  }

  const haystack = [entry.source, entry.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (!haystack) {
    return false
  }
  return tokens.some((token) => containsAgentToken(haystack, token))
}

function containsAgentToken(value: string, token: string) {
  if (!value || !token) {
    return false
  }
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(token)}(?=$|[^a-z0-9])`,
    "i",
  ).test(value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function agentIdentityTokens(agent: AgentDashboardAgent) {
  const base = [agent.id, agent.name, friendlyAgentName(agent)]
  const aliases: Record<string, string[]> = {
    lia: ["marketing", "campanha", "instagram"],
    marcos: ["vendas", "sales", "comercial"],
    camila: ["suporte", "pos-venda", "pós-venda"],
    sofia: ["onboarding", "discovery", "cadastro"],
    catarina: ["aprofundamento", "curadoria"],
    operador: ["operator", "tecnico", "técnico", "dev"],
    rafael: [
      "assistente interno",
      "interno",
      "analytics",
      "padroes",
      "padrões",
      "relatorio diario",
      "relatório diário",
    ],
    clara: ["atendente", "atendimento"],
  }
  const key = String(agent.id || agent.name).toLowerCase()
  for (const [aliasKey, values] of Object.entries(aliases)) {
    if (
      key.includes(aliasKey) ||
      String(agent.name).toLowerCase().includes(aliasKey)
    ) {
      base.push(...values)
    }
  }
  return [...new Set(base)]
    .flatMap((value) =>
      String(value || "")
        .toLowerCase()
        .split(/[\s/_-]+/),
    )
    .concat(base.map((value) => String(value || "").toLowerCase()))
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 || token === "qa")
}

export function formatDashboardDate(value?: string) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function compactDashboardCount(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}

export function normalizeAgentDashboardResponse(
  response: AgentDashboardResponseInput | null | undefined,
): AgentDashboardResponse {
  const metrics = normalizeDashboardMetrics(response?.metrics)
  const health = normalizeDashboardHealth(response?.health, response)

  return {
    workspace: response?.workspace || "workspace",
    generated_at: response?.generated_at || health.updated_at,
    metrics,
    agents: asArray(response?.agents).map(normalizeDashboardAgent),
    items: asArray(response?.items).map(normalizeDashboardItem),
    tasks: asArray(response?.tasks).map(normalizeDashboardTask),
    artifacts: asArray(response?.artifacts).map(normalizeDashboardArtifact),
    health,
  }
}

function normalizeDashboardMetrics(
  metrics: Partial<AgentDashboardMetrics> | null | undefined,
): AgentDashboardMetrics {
  return {
    agents: normalizeNumber(metrics?.agents),
    active_agents: normalizeNumber(metrics?.active_agents),
    pending_items: normalizeNumber(metrics?.pending_items),
    reports: normalizeNumber(metrics?.reports),
    active_tasks: normalizeNumber(metrics?.active_tasks),
    alerts: normalizeNumber(metrics?.alerts),
  }
}

function normalizeDashboardHealth(
  health: AgentDashboardHealthInput | null | undefined,
  response:
    | Pick<AgentDashboardResponseInput, "generated_at">
    | null
    | undefined,
): AgentDashboardHealth {
  return {
    missing_sources: asStringArray(health?.missing_sources),
    errors: asStringArray(health?.errors),
    updated_at:
      health?.updated_at || response?.generated_at || new Date(0).toISOString(),
  }
}

function normalizeDashboardAgent(
  agent: Partial<AgentDashboardAgent>,
): AgentDashboardAgent {
  return {
    id: String(agent.id || agent.name || "agent"),
    name: String(agent.name || agent.id || "Agente"),
    role: String(agent.role || "Agente"),
    active: Boolean(agent.active),
    item_count: normalizeNumber(agent.item_count),
    task_count: normalizeNumber(agent.task_count),
    last_item_at: agent.last_item_at,
  }
}

function normalizeDashboardItem(
  item: Partial<AgentDashboardItem>,
): AgentDashboardItem {
  return {
    id: String(item.id || item.title || "item"),
    type: item.type || "result",
    status: item.status || "new",
    title: String(item.title || "Item sem título"),
    summary: item.summary,
    agent_id: item.agent_id,
    agent_name: item.agent_name,
    priority: item.priority,
    source: String(item.source || "workspace"),
    created_at: item.created_at,
    updated_at: item.updated_at,
    due_at: item.due_at,
    tags: asStringArray(item.tags),
    metrics: item.metrics ?? undefined,
    artifacts: asArray(item.artifacts).map(normalizeDashboardArtifact),
  }
}

function normalizeDashboardTask(
  task: Partial<AgentDashboardTask>,
): AgentDashboardTask {
  return {
    id: String(task.id || task.title || "task"),
    title: String(task.title || "Tarefa sem título"),
    status: task.status || "pending",
    agent_id: task.agent_id,
    agent_name: task.agent_name,
    source: String(task.source || "workspace"),
    schedule: task.schedule,
    next_run_at: task.next_run_at,
    updated_at: task.updated_at,
  }
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function normalizeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0
}

function normalizeDashboardArtifact(
  artifact: Partial<AgentDashboardArtifact>,
): AgentDashboardArtifact {
  return {
    id: String(artifact.id || artifact.url || artifact.source || "arquivo"),
    type: artifact.type || "file",
    title: String(
      artifact.title ||
        friendlyFileTitle(artifact.url || artifact.source || "Arquivo"),
    ),
    source: String(artifact.source || ""),
    url: String(artifact.url || ""),
    agent_id: artifact.agent_id,
    agent_name: artifact.agent_name,
    created_at: artifact.created_at,
  }
}

export function friendlyDashboardText(value?: string): string {
  const text = String(value || "").trim()
  if (!text) {
    return ""
  }
  return text
    .replace(/workspace\/[^\s,.)]+/g, "um arquivo do sistema")
    .replace(/[A-Za-z0-9_-]+\.tsx\b/g, "uma tela")
    .replace(/[A-Za-z0-9_-]+\.md\b/g, "um documento")
    .replace(/\bconfig\/company-profile\.md\b/g, "dados da empresa")
    .replace(/\bconfig\/authorized-channels\.md\b/g, "canais autorizados")
    .replace(/\bfrontend\b/gi, "tela")
    .replace(/\bcore\b/gi, "cadastro principal")
    .replace(/\bsetup\b/gi, "configuração inicial")
    .replace(/\bdedup\b/gi, "evitar duplicidade")
    .replace(/\bgo-live\b/gi, "publicação")
}

export function friendlyDashboardSourceLabel(source?: string): string {
  const value = String(source || "")
  if (value.includes("workspace/memory/melhorias")) {
    return "Memória de melhorias"
  }
  if (value.includes("workspace/memory/relatorios")) {
    return "Relatório salvo"
  }
  if (value.includes("workspace/memory/padroes")) {
    return "Análise salva"
  }
  if (value.includes("workspace/output/plans")) {
    return "Plano gerado"
  }
  if (
    value.includes("workspace/output/data") ||
    value.includes("workspace/output/analytics")
  ) {
    return "Dados gerados"
  }
  if (value.includes("workspace/tests/relatorios")) {
    return "Relatório de teste"
  }
  if (value.includes("workspace/cron/jobs")) {
    return "Rotina automática"
  }
  if (value.includes("workspace/output")) {
    return "Arquivo gerado"
  }
  if (value.includes("dashboard/items")) {
    return "Publicado por agente"
  }
  if (value.startsWith("agent:")) {
    return "Proposta do agente"
  }
  return "Painel dos agentes"
}

export function friendlyTaskTitle(task: AgentDashboardTask): string {
  const raw = task.title || task.id
  const key = raw.toLowerCase()
  if (key.includes("monthly") && key.includes("marketing")) {
    return "Preparar posicionamento mensal de marketing"
  }
  if (key.includes("weekly") && key.includes("marketing")) {
    return "Preparar ideias semanais de marketing"
  }
  if (key.includes("relatório diário") || key.includes("daily")) {
    return "Enviar resumo diário do atendimento"
  }
  if (key.includes("padrões") || key.includes("patterns")) {
    return "Revisar padrões da semana"
  }
  return friendlyDashboardText(raw)
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function friendlyTaskSchedule(schedule?: string): string {
  const value = String(schedule || "").trim()
  if (!value) {
    return "Agenda ainda não definida"
  }
  const parts = value.split(/\s+/)
  if (parts.length >= 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
    if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
      return `Todo mês, dia ${dayOfMonth}, às ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    }
    if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
      return `Toda ${weekdayLabel(dayOfWeek)}, às ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    }
    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `Todos os dias às ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    }
  }
  return value.replace(/^every /i, "A cada ")
}

export function friendlyAgentName(taskOrItem: {
  agent_name?: string
  agent_id?: string
  name?: string
  id?: string
}): string {
  const value =
    taskOrItem.agent_name ||
    taskOrItem.name ||
    taskOrItem.agent_id ||
    taskOrItem.id ||
    "Agente"
  switch (value.toLowerCase()) {
    case "main":
      return "Equipe principal"
    case "assistente":
    case "rafael":
    case "rafael-assistente":
    case "rafael-assistente-interno":
      return "Rafael"
    case "vendas":
    case "sales":
    case "marcos":
    case "marcos-vendas":
      return "Marcos"
    case "marketing":
    case "lia":
      return "Lia"
    case "sofia":
      return "Sofia"
    case "catarina":
      return "Catarina"
    case "camila":
    case "camila-suporte":
      return "Camila"
    case "clara":
    case "clara-atendente":
      return "Clara"
    case "luna":
    case "luna-atendente":
      return "Luna"
    case "operador":
      return "Operador"
    case "qa-tester":
      return "QA Tester"
    case "transferencia-humana":
      return "Atendimento Humano"
    default:
      return value
  }
}

export function dashboardArtifactLabel(type?: string): string {
  switch (type) {
    case "image":
      return "Imagem"
    case "document":
      return "Documento"
    case "site":
      return "Site"
    case "service":
      return "Serviço"
    case "link":
      return "Link"
    default:
      return "Arquivo"
  }
}

export function friendlyFileTitle(value: string): string {
  try {
    const parsed = new URL(value)
    return parsed.hostname
  } catch {
    const file = value.split(/[\\/]/).filter(Boolean).at(-1) || value
    const stem = file.replace(/\.[^.]+$/, "")
    return stem
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\w/, (char) => char.toUpperCase())
  }
}

function weekdayLabel(value: string): string {
  switch (value) {
    case "0":
    case "7":
      return "domingo"
    case "1":
      return "segunda"
    case "2":
      return "terça"
    case "3":
      return "quarta"
    case "4":
      return "quinta"
    case "5":
      return "sexta"
    case "6":
      return "sábado"
    default:
      return `dia ${value}`
  }
}
