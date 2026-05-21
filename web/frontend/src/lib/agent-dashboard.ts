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
  response: Partial<AgentDashboardResponse> | null | undefined,
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
  health: Partial<AgentDashboardHealth> | null | undefined,
  response: Partial<AgentDashboardResponse> | null | undefined,
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
}): string {
  const value = taskOrItem.agent_name || taskOrItem.agent_id || "Agente"
  switch (value.toLowerCase()) {
    case "main":
      return "Equipe principal"
    case "marketing":
      return "Marketing"
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
