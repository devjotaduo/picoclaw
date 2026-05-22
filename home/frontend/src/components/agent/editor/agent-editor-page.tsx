import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBraces,
  IconCheck,
  IconDeviceFloppy,
  IconEdit,
  IconFileDescription,
  IconHeadset,
  IconLoader2,
  IconMessageCircle,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconSend,
  IconSettings,
  IconShield,
  IconSparkles,
  IconTargetArrow,
  IconTrash,
  IconUserShield,
  IconUsers,
  IconWorldWww,
} from "@tabler/icons-react"
import { IconCopy, IconDotsVertical } from "@tabler/icons-react"
import {
  IconExternalLink,
  IconHistory,
  IconMessageDots,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type AgentConfigResponse,
  type AgentEditorAgent,
  type AgentSummary,
  applyAgentTemplate,
  createAgent,
  deleteAgent,
  getAgentEditorState,
  updateAgent,
} from "@/api/agent-templates"
import {
  getInternalAgentProposals,
  sendInternalAgentTurn,
  updateInternalAgentOrchestration,
} from "@/api/internal-agents"
import { getLauncherPolicy } from "@/api/launcher-policy"
import { type SkillSupportItem, getSkills } from "@/api/skills"
import { listWhatsAppChats } from "@/api/whatsapp"
import { AIOrbAvatar } from "@/components/chat/ai-orb-avatar"
import { PendingHandoffsSidebar } from "@/components/chat/pending-handoffs-sidebar"
import { CodeEditor } from "@/components/code-editor"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { SaveState } from "@/store/agent-editor"

import { AGENT_TEMPLATES, getTemplateById } from "../templates/catalog"
import { substituteAgentPlaceholders } from "../templates/substitute-placeholders"
import { TemplateConfigSheet } from "../templates/template-config-sheet"
import { DEFAULT_BEHAVIOR } from "../templates/types"
import type {
  AgentTemplate,
  TemplateApplyPayload,
  TemplateKnowledgeBase,
  TemplateSkillConfig,
} from "../templates/types"
import {
  defaultTemplateSkillConfigs,
  templateToDraft,
} from "../templates/use-templates-page"
import {
  type AgentListControls,
  type AgentListStatusFilter,
  DEFAULT_AGENT_LIST_CONTROLS,
  applyAgentListControls,
} from "./agent-list-filter"
import { AgentWizard, type WizardDraft } from "./agent-wizard"
import { AvatarUpload } from "./avatar-upload"
import { ChatTestDrawer } from "./chat-test-drawer"
import {
  type ActiveConversation,
  DeactivateAgentDialog,
} from "./deactivate-agent-dialog"
import { LabelWithTooltip } from "./label-with-tooltip"
import { PromptPreview } from "./prompt-preview"
import { SaveBar } from "./save-bar"
import { isReadyToActivate, validateChecklist } from "./schemas"
import { type AgentEditorTab, TabsNav } from "./tabs-nav"
import { TagInput } from "./tag-input"
import "./tokens.css"
import { useDirtyGuard, useSaveShortcut } from "./use-dirty-guard"
import { useTabSync } from "./use-tab-sync"
import { appendVersion } from "./version-history"
import { VersionHistoryDrawer } from "./version-history-drawer"
import { jidToPhone } from "./whatsapp-format"
import { WhatsAppGroupList } from "./whatsapp-group-list"
import { WhatsAppPhoneList } from "./whatsapp-phone-list"
import { WorkspaceDisplay } from "./workspace-display"

// ─── orchestration-specific types ────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string }

type AgentProfileDraft = {
  name: string
  icon: string
  initials: string
  background: string
  foreground: string
  imageURL: string
}

type RoleConfigDraft = Record<string, unknown>

type MarketingRoleConfig = {
  platforms?: string[]
  deliverables?: string[]
  approval_mode?: string
  public_publish_dir?: string
  brand_kit?: {
    colors?: string[]
    fonts?: string[]
    tone?: string
    visual_style?: string
  }
  content_pillars?: string[]
  audiences?: unknown[]
  cadence?: {
    posts_per_week?: number
    campaigns_per_month?: number
    planning_horizon?: string
  }
  trend_sources?: string[]
  competitors?: string[]
  default_image_sizes?: Record<string, string>
  requires_human_review?: boolean
}

type SalesRoleConfig = {
  funnel_stages?: string[]
  qualification_fields?: string[]
  followup_cadence?: string[]
  crm_integration?: string
  price_policy_source?: string
  handoff_rules?: string[]
}

type AttendantRoleConfig = {
  departments?: string[]
  triage_fields?: string[]
  escalation_rules?: string[]
  scheduling_enabled?: boolean
  faq_source?: string
}

type AssistantRoleConfig = {
  authorized_scopes?: string[]
  report_cadence?: string[]
  can_edit_agents?: boolean
  can_call_agents?: string[]
  requires_confirmation?: string[]
  audit_level?: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeAgentIDPreview(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64)
  return normalized || "main"
}

function uniqueAgentID(seed: string, existing: string[]): string {
  const base = normalizeAgentIDPreview(seed)
  if (!existing.includes(base)) return base
  for (let i = 2; i < 100; i++) {
    const candidate = normalizeAgentIDPreview(`${base}-${i}`)
    if (!existing.includes(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function agentInitials(agent: AgentSummary): string {
  const name = agent.name || agent.id
  const parts = name.split(/[\s_-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function defaultAvatarForAgent(agent: AgentSummary) {
  switch (agent.id) {
    case "main":
      return {
        icon: "headset",
        initials: "AN",
        background: "#2563eb",
        foreground: "#ffffff",
        image_url: "",
      }
    case "vendas":
      return {
        icon: "target",
        initials: "LE",
        background: "#16a34a",
        foreground: "#ffffff",
        image_url: "",
      }
    case "marketing":
      return {
        icon: "sparkles",
        initials: "MA",
        background: "#f43f5e",
        foreground: "#ffffff",
        image_url: "",
      }
    case "assistente":
      return {
        icon: "assistant",
        initials: "SO",
        background: "#7c3aed",
        foreground: "#ffffff",
        image_url: "",
      }
    default:
      return {
        icon: "robot",
        initials: agentInitials(agent),
        background: "#475569",
        foreground: "#ffffff",
        image_url: "",
      }
  }
}

function renderAvatarIcon(icon: string | undefined, className: string) {
  switch ((icon || "").trim().toLowerCase()) {
    case "headset":
      return <IconHeadset className={className} />
    case "target":
    case "sales":
      return <IconTargetArrow className={className} />
    case "sparkles":
    case "marketing":
      return <IconSparkles className={className} />
    case "assistant":
    case "shield":
      return <IconUserShield className={className} />
    case "robot":
      return <IconRobot className={className} />
    case "site":
    case "world":
      return <IconWorldWww className={className} />
    default:
      return null
  }
}

function agentRoleLabel(agent: AgentSummary): string {
  switch (agent.id) {
    case "main":
      return "Atendente principal"
    case "vendas":
      return "Consultor de vendas"
    case "marketing":
      return "Especialista de marketing"
    case "assistente":
      return "Assistente do dono"
    default:
      return agent.role_config?.description || agent.template_id || "Agente"
  }
}

function marketingPublishDir(agent: AgentSummary): string {
  return agent.role_config?.marketing?.public_publish_dir || "public/marketing"
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function lines(value?: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : ""
}

function parseRoleConfigDraft(draft: string): RoleConfigDraft | null {
  try {
    const parsed = JSON.parse(draft || "{}") as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null
    return parsed as RoleConfigDraft
  } catch {
    return null
  }
}

function proposalKind(proposal: unknown): string {
  if (!proposal || typeof proposal !== "object") return ""
  const r = proposal as Record<string, unknown>
  return typeof r.kind === "string" ? r.kind : ""
}

function proposalTitle(proposal: unknown): string {
  if (!proposal || typeof proposal !== "object") return "Proposta"
  const r = proposal as Record<string, unknown>
  for (const key of ["title", "name", "campaign_name"]) {
    const v = r[key]
    if (typeof v === "string" && v.trim()) return v
  }
  return proposalKind(proposal) || "Proposta"
}

function proposalAssets(proposal: unknown): string[] {
  if (!proposal || typeof proposal !== "object") return []
  const assets = (proposal as Record<string, unknown>).asset_paths
  return Array.isArray(assets)
    ? assets.filter((x): x is string => typeof x === "string")
    : []
}

function proposalPublicURLs(proposal: unknown): string[] {
  if (!proposal || typeof proposal !== "object") return []
  const urls = (proposal as Record<string, unknown>).public_urls
  return Array.isArray(urls)
    ? urls.filter((x): x is string => typeof x === "string")
    : []
}

function profileDraftFromInternal(agent: AgentEditorAgent): AgentProfileDraft {
  const fallbacksByID: Record<string, AgentProfileDraft> = {
    main: {
      name: "Ana",
      icon: "headset",
      initials: "AN",
      background: "#2563eb",
      foreground: "#ffffff",
      imageURL: "",
    },
    vendas: {
      name: "Leo",
      icon: "target",
      initials: "LE",
      background: "#16a34a",
      foreground: "#ffffff",
      imageURL: "",
    },
    marketing: {
      name: "Maya",
      icon: "sparkles",
      initials: "MA",
      background: "#f43f5e",
      foreground: "#ffffff",
      imageURL: "",
    },
    assistente: {
      name: "Sofia",
      icon: "assistant",
      initials: "SO",
      background: "#7c3aed",
      foreground: "#ffffff",
      imageURL: "",
    },
  }
  const fallback = fallbacksByID[agent.id] ?? {
    name: agent.name || agent.id,
    icon: "robot",
    initials: (agent.name || agent.id).slice(0, 2).toUpperCase(),
    background: "#475569",
    foreground: "#ffffff",
    imageURL: "",
  }
  return {
    name: agent.name || fallback.name,
    icon: agent.avatar?.icon || fallback.icon,
    initials: agent.avatar?.initials || fallback.initials,
    background: agent.avatar?.background || fallback.background,
    foreground: agent.avatar?.foreground || fallback.foreground,
    imageURL: agent.avatar?.image_url || fallback.imageURL,
  }
}

const quickPromptsByAgent: Record<
  string,
  Array<{ icon: React.ElementType; label: string; prompt: string }>
> = {
  marketing: [
    {
      icon: IconWorldWww,
      label: "Testar site",
      prompt:
        "Crie um site simples de uma página para uma empresa fictícia chamada Studio Solar, com hero, benefícios, planos sob consulta e contato pelo WhatsApp a confirmar. Salve em public/marketing/site-studio-solar.html e registre proposta kind site.",
    },
    {
      icon: IconFileDescription,
      label: "Testar catálogo",
      prompt:
        "Crie um catálogo HTML simples para a empresa fictícia Café Aurora com 3 produtos: Espresso R$8, Capuccino R$12 e Cold Brew R$15. Salve em public/marketing/catalogo-cafe-aurora.html e registre proposta kind catalog.",
    },
    {
      icon: IconPhoto,
      label: "Campanha",
      prompt:
        "Crie uma campanha curta para Instagram para uma empresa fictícia de serviços locais, com ideia visual, legenda, CTA e próximos passos. Não gere imagem agora.",
    },
  ],
}

function agentKind(
  agentID: string,
): "attendant" | "sales" | "marketing" | "assistant" | "custom" {
  switch (agentID) {
    case "main":
      return "attendant"
    case "vendas":
      return "sales"
    case "marketing":
      return "marketing"
    case "assistente":
      return "assistant"
    default:
      return "custom"
  }
}

function promptEditLabel(agent: AgentSummary): string {
  const name = agent.name || agent.id
  switch (agent.id) {
    case "main":
      return `Editar atendimento da ${name}`
    case "vendas":
      return `Editar vendas do ${name}`
    case "marketing":
      return `Editar marketing da ${name}`
    case "assistente":
      return `Editar assistente ${name}`
    default:
      return `Editar prompt de ${name}`
  }
}

function promptSheetTitle(agent?: AgentSummary | null): string {
  if (!agent) return "Prompt do agente"
  const name = agent.name || agent.id
  switch (agent.id) {
    case "vendas":
      return `${name}: vendas e follow-up`
    case "marketing":
      return `${name}: marketing, sites e catálogos`
    case "assistente":
      return `${name}: assistente privada`
    case "main":
      return `${name}: atendimento público`
    default:
      return `${name}: prompt do workspace`
  }
}

function rolePromptDefaults(
  agent: AgentSummary,
): Pick<
  TemplateApplyPayload,
  | "template_id"
  | "short_description"
  | "presentation"
  | "functions"
  | "prohibitions"
  | "protections"
  | "approval_required_for"
> {
  switch (agent.id) {
    case "vendas":
      return {
        template_id: "especialista-vendas",
        short_description:
          "Consultor comercial subagente para qualificação, venda e follow-up.",
        presentation:
          "Sou o Leo, consultor comercial. Qualifico oportunidades, trato objeções, organizo follow-up e devolvo um resumo comercial objetivo.",
        functions: [
          "Qualificar leads",
          "Classificar estágio do funil",
          "Sugerir próxima ação",
          "Preparar resumo comercial",
        ],
        prohibitions: [
          "Não fazer suporte operacional",
          "Não criar campanhas de marketing",
          "Não prometer preço sem fonte confirmada",
        ],
        protections: [
          "Encaminhar exceções comerciais para aprovação humana",
          "Registrar dados faltantes antes de avançar",
        ],
        approval_required_for: [
          "desconto",
          "condição comercial especial",
          "contrato",
          "promessa de prazo",
        ],
      }
    case "marketing":
      return {
        template_id: "especialista-marketing",
        short_description:
          "Especialista de marketing para campanhas, posts, imagens, catálogos HTML e sites simples.",
        presentation:
          "Sou a Maya, especialista de marketing. Crio campanhas, posts, calendários, catálogos HTML e sites simples para aprovação.",
        functions: [
          "Criar posts e campanhas",
          "Gerar ideias visuais",
          "Salvar catálogos e sites em public/marketing",
          "Apontar pendências para aprovação",
        ],
        prohibitions: [
          "Não atender cliente final",
          "Não vender no lugar do Leo",
          "Não publicar sem aprovação quando a regra exigir",
        ],
        protections: [
          "Usar a pasta pública configurada",
          "Registrar arquivos e URLs gerados",
          "Pedir aprovação quando houver risco de marca",
        ],
        approval_required_for: [
          "publicação externa",
          "uso de imagem sensível",
          "promoção com preço",
          "campanha paga",
        ],
      }
    case "assistente":
      return {
        template_id: "assistente-dono",
        short_description:
          "Assistente privada do dono para organização, relatórios, documentos e coordenação dos agentes.",
        presentation:
          "Sou a Sofia, assistente privada do dono. Organizo agenda, relatórios, documentos, workspace e coordeno Ana, Leo e Maya quando necessário.",
        functions: [
          "Organizar agenda e relatórios",
          "Editar workspace autorizado",
          "Coordenar agentes internos",
          "Solicitar confirmação para mudanças sensíveis",
        ],
        prohibitions: [
          "Não agir como atendente pública",
          "Não atender WhatsApp público",
          "Não executar mudanças sensíveis sem confirmação",
        ],
        protections: [
          "Verificar autorização do solicitante",
          "Registrar decisões importantes",
          "Pedir confirmação antes de alterar agentes ou permissões",
        ],
        approval_required_for: [
          "alterar agentes",
          "alterar permissões",
          "apagar arquivos",
          "enviar relatório externo",
        ],
      }
    default:
      return {
        template_id: "atendente-geral",
        short_description:
          "Atendente principal para dúvidas, triagem, encaminhamento e agendamento.",
        presentation:
          "Olá! Sou a Ana, atendente principal. Posso responder dúvidas, coletar dados iniciais e encaminhar para o setor certo.",
        functions: [
          "Responder dúvidas gerais",
          "Fazer triagem",
          "Encaminhar para vendas",
          "Apoiar agendamentos",
        ],
        prohibitions: [
          "Não inventar informação",
          "Não chamar marketing ou assistente pelo WhatsApp público",
        ],
        protections: [
          "Encaminhar casos sensíveis para humano",
          "Pedir dados mínimos antes de acionar vendas",
        ],
        approval_required_for: [
          "informação sensível",
          "exceção comercial",
          "assunto jurídico",
        ],
      }
  }
}

function defaultDraftForAgent(
  agent: AgentSummary,
  installedSkills: SkillSupportItem[],
): TemplateApplyPayload {
  const baseTemplate = AGENT_TEMPLATES[0]
  const defaultSkillConfigs = baseTemplate
    ? defaultSkillConfigsForAgent(agent, baseTemplate, installedSkills)
    : []
  const base = baseTemplate
    ? templateToDraft(baseTemplate, defaultSkillConfigs)
    : hydrateAgentPayload({} as TemplateApplyPayload)
  const defaults = rolePromptDefaults(agent)
  return hydrateAgentPayload({
    ...base,
    ...defaults,
    agent_id: agent.id,
    name: agent.name || base.name || agent.id,
    company_info: {
      ...base.company_info,
      name: base.company_info?.name || "{company.name}",
    },
  })
}

const defaultAgentSkillRecommendations: Record<string, string[]> = {
  vendas: [
    "lead-qualification",
    "bant-spin-discovery",
    "objection-handling",
    "product-interest-extraction",
    "whatsapp-follow-up-planner",
  ],
  marketing: [],
  assistente: [
    "internal-policy-search",
    "confidentiality-check",
    "whatsapp-report-builder",
    "whatsapp-conversation-summary",
    "human-handoff-brief",
    "lgpd-check",
    "sensitive-data-protection",
    "log-sanitizer",
  ],
}

function skillConfigsFromNames(
  names: string[],
  installedSkills: SkillSupportItem[],
): TemplateSkillConfig[] {
  const installedByName = new Map(
    installedSkills.map((skill) => [skill.name.toLowerCase(), skill.name]),
  )
  return names
    .map((name) => installedByName.get(name.toLowerCase()))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, enabled: true, visible: true }))
}

function defaultSkillConfigsForAgent(
  agent: AgentSummary,
  baseTemplate: AgentTemplate,
  installedSkills: SkillSupportItem[],
): TemplateSkillConfig[] {
  const recommended = defaultAgentSkillRecommendations[agent.id]
  if (recommended) {
    return skillConfigsFromNames(recommended, installedSkills)
  }
  return defaultTemplateSkillConfigs(baseTemplate, installedSkills)
}

function hydrateKnowledgeBase(
  knowledgeBase?: TemplateKnowledgeBase,
): TemplateKnowledgeBase {
  return {
    overview: knowledgeBase?.overview ?? "",
    faqs: (knowledgeBase?.faqs ?? []).map((faq) => ({
      question: faq.question ?? "",
      answer: faq.answer ?? "",
    })),
  }
}

function hydrateAgentPayload(raw: TemplateApplyPayload): TemplateApplyPayload {
  const legacySkills = legacyPayloadSkills(raw)
  return {
    ...raw,
    short_description: raw.short_description ?? "",
    personality: raw.personality ?? [],
    values: raw.values ?? [],
    functions: raw.functions ?? [],
    prohibitions: raw.prohibitions ?? [],
    protections: raw.protections ?? [],
    skill_configs:
      raw.skill_configs ??
      legacySkills.map((name) => ({ name, enabled: true, visible: true })),
    conversation_flow: raw.conversation_flow ?? [],
    required_fields_by_intent: raw.required_fields_by_intent ?? {},
    response_examples: {
      ...{
        greeting: "",
        clarification: "",
        unknown_answer: "",
        routing: "",
        closing: "",
      },
      ...raw.response_examples,
    },
    knowledge_base: hydrateKnowledgeBase(raw.knowledge_base),
    style_guide: {
      emoji_policy: raw.style_guide?.emoji_policy ?? "minimal",
      do: raw.style_guide?.do ?? [],
      dont: raw.style_guide?.dont ?? [],
    },
    fallback_policy: {
      max_clarifying_questions:
        raw.fallback_policy?.max_clarifying_questions ?? 0,
      when_unsure: raw.fallback_policy?.when_unsure ?? "",
      when_to_route: raw.fallback_policy?.when_to_route ?? [],
      route_message: raw.fallback_policy?.route_message ?? "",
    },
    handoff_summary_template: raw.handoff_summary_template ?? {
      cliente: "",
      contato: "",
      motivo: "",
      resumo: "",
      dados_coletados: "",
      urgencia: "",
      setor_destino: "",
      proxima_acao: "",
    },
    structured_output_template: raw.structured_output_template ?? {
      intent: "",
      confidence: "",
      collected_fields: {},
      missing_fields: [],
      needs_routing: false,
      target_sector: "",
      priority: "",
      summary: "",
      next_action: "",
    },
    priority_rules: {
      high: raw.priority_rules?.high ?? [],
      medium: raw.priority_rules?.medium ?? [],
      low: raw.priority_rules?.low ?? [],
    },
    knowledge_policy: raw.knowledge_policy ?? [],
    security_rules: raw.security_rules ?? [],
    quality_metrics: raw.quality_metrics ?? [],
    modules: {
      professionals_enabled: raw.modules?.professionals_enabled ?? false,
      products_enabled: raw.modules?.products_enabled ?? false,
    },
    professionals: raw.professionals ?? [],
    products: raw.products ?? [],
    recommended_tools: raw.recommended_tools ?? [],
    tool_namespaces: raw.tool_namespaces ?? [],
    required_integrations: raw.required_integrations ?? [],
    approval_required_for: raw.approval_required_for ?? [],
    company_info: {
      ...raw.company_info,
      general_info: raw.company_info?.general_info ?? "",
      schedule: raw.company_info?.schedule ?? {
        monday: { open: false, from: "", to: "" },
        tuesday: { open: false, from: "", to: "" },
        wednesday: { open: false, from: "", to: "" },
        thursday: { open: false, from: "", to: "" },
        friday: { open: false, from: "", to: "" },
        saturday: { open: false, from: "", to: "" },
        sunday: { open: false, from: "", to: "" },
        notes: "",
      },
    },
    behavior: { ...DEFAULT_BEHAVIOR, ...raw.behavior },
  }
}

function legacyPayloadSkills(payload?: TemplateApplyPayload | null): string[] {
  const rawSkills = (
    payload as (TemplateApplyPayload & { skills?: unknown }) | null | undefined
  )?.skills
  if (!Array.isArray(rawSkills)) return []
  return rawSkills
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

function enabledSkillCount(payload?: TemplateApplyPayload | null): number {
  const configs = payload?.skill_configs ?? []
  if (configs.length > 0) {
    return configs.filter((skill) => skill.enabled).length
  }
  return legacyPayloadSkills(payload).length
}

function prepareDraftForEdit(
  raw: TemplateApplyPayload,
  agentId: string,
): TemplateApplyPayload {
  return {
    ...substituteAgentPlaceholders(hydrateAgentPayload(raw)),
    agent_id: agentId,
  }
}

// ─── shared UI sub-components ─────────────────────────────────────────────────

const editorPanelClass =
  "border-border/60 bg-card rounded-lg border p-4 shadow-none"

function AgentAvatar({
  agent,
  size = "md",
}: {
  agent: AgentSummary
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-14 text-base",
  }
  const fallback = defaultAvatarForAgent(agent)
  const avatar = agent.avatar ?? fallback
  const imageURL = avatar.image_url?.trim()
  const initials = avatar.initials?.trim() || fallback.initials
  const seed = `${agent.id}:${agent.name || initials}`
  const icon = renderAvatarIcon(
    avatar.icon || fallback.icon,
    size === "lg" ? "size-7" : "size-4",
  )

  return (
    <div
      className={`${sizeClasses[size]} ring-border/50 relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1`}
      style={{
        backgroundColor: imageURL
          ? avatar.background || fallback.background
          : undefined,
        color: avatar.foreground || fallback.foreground,
      }}
      aria-hidden="true"
    >
      {imageURL ? (
        <img src={imageURL} alt="" className="size-full object-cover" />
      ) : (
        <>
          <AIOrbAvatar seed={seed} className="absolute inset-0" />
          <span className="relative z-10 flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
            {icon ?? initials}
          </span>
        </>
      )}
    </div>
  )
}

function ProfileAvatar({ profile }: { profile: AgentProfileDraft }) {
  const imageURL = profile.imageURL.trim()
  const initials =
    profile.initials.trim() || profile.name.slice(0, 2).toUpperCase()
  const seed = `${profile.name}:${profile.icon}:${initials}`
  const icon = renderAvatarIcon(profile.icon, "size-4")

  return (
    <span
      className="ring-border/50 relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ring-1"
      style={{
        backgroundColor: imageURL ? profile.background || "#475569" : undefined,
        color: profile.foreground || "#ffffff",
      }}
      aria-hidden="true"
    >
      {imageURL ? (
        <img src={imageURL} alt="" className="size-full object-cover" />
      ) : (
        <>
          <AIOrbAvatar seed={seed} className="absolute inset-0" />
          <span className="relative z-10 flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
            {icon ?? initials}
          </span>
        </>
      )}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={`border-border bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
        active ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {active
        ? t("pages.agent.editor.active", "Ativo")
        : t("pages.agent.editor.inactive", "Inativo")}
    </span>
  )
}

function DefaultBadge() {
  const { t } = useTranslation()
  return (
    <span className="border-border bg-background text-foreground inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
      {t("pages.agent.editor.default", "Padrão")}
    </span>
  )
}

function InfoCard({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | undefined | null
  mono?: boolean
}) {
  return (
    <div className="border-border/60 bg-card min-w-0 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p
        className={`text-foreground min-w-0 truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}
        title={value || "—"}
      >
        {value || "—"}
      </p>
    </div>
  )
}

function SectionHeader({
  title,
  icon: Icon,
}: {
  title: string
  icon: React.ElementType
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="text-muted-foreground size-3.5" />
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export function AgentEditorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // ── editor state ──────────────────────────────────────────────────────────
  const editorStateQuery = useQuery({
    queryKey: ["agent-editor-state"],
    queryFn: getAgentEditorState,
  })
  const agents = useMemo(
    () => editorStateQuery.data?.agents ?? [],
    [editorStateQuery.data?.agents],
  )
  const firstAgentId =
    agents.find((a) => a.default)?.id ?? agents[0]?.id ?? "main"

  const [selectedAgentId, setSelectedAgentId] = useState(firstAgentId)
  const [searchQuery, setSearchQuery] = useState("")
  const [listStatus, setListStatus] = useState<AgentListStatusFilter>(
    DEFAULT_AGENT_LIST_CONTROLS.status,
  )
  const listSort = DEFAULT_AGENT_LIST_CONTROLS.sort
  const prevAgentIdRef = useRef(selectedAgentId)

  useEffect(() => {
    if (agents.length === 0) return
    if (!agents.some((a) => a.id === selectedAgentId))
      setSelectedAgentId(firstAgentId)
  }, [agents, firstAgentId, selectedAgentId])

  useEffect(() => {
    prevAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

  const selectedAgent =
    agents.find((a) => a.id === selectedAgentId) ?? agents[0] ?? null
  const selectedPrompt = selectedAgent?.prompt
  const configData = useMemo<AgentConfigResponse>(
    () => ({
      configured: selectedPrompt?.configured ?? false,
      payload: selectedPrompt?.payload,
      applied_at: selectedPrompt?.applied_at,
    }),
    [selectedPrompt],
  )
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills })
  const installedSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )
  const launcherPolicyQuery = useQuery({
    queryKey: ["launcher-policy"],
    queryFn: getLauncherPolicy,
  })
  const canCreateAgents =
    launcherPolicyQuery.data?.features.agent_creation === "write" ||
    launcherPolicyQuery.isError

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TemplateApplyPayload | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const [activeTab, setActiveTab] = useTabSync("identity")
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [advancedJsonMode, setAdvancedJsonMode] = useState(false)
  const [rawDraft, setRawDraft] = useState("")
  const [rawError, setRawError] = useState<string | null>(null)

  useEffect(() => {
    if (!canCreateAgents && createOpen) {
      setCreateOpen(false)
    }
  }, [canCreateAgents, createOpen])

  const template = useMemo<AgentTemplate | null>(() => {
    const id =
      draft?.template_id ??
      selectedPrompt?.payload?.template_id ??
      selectedPrompt?.template_id
    if (!id) return null
    return getTemplateById(id) ?? AGENT_TEMPLATES[0] ?? null
  }, [
    draft?.template_id,
    selectedPrompt?.payload?.template_id,
    selectedPrompt?.template_id,
  ])

  // ── orchestration state ───────────────────────────────────────────────────
  const [mainAgentID, setMainAgentID] = useState("main")
  const [mainAllowAgents, setMainAllowAgents] = useState<string[]>([])
  const [assistantJIDs, setAssistantJIDs] = useState("")
  const [assistantChats, setAssistantChats] = useState("")
  const [profiles, setProfiles] = useState<Record<string, AgentProfileDraft>>(
    {},
  )
  const [roleConfigDrafts, setRoleConfigDrafts] = useState<
    Record<string, string>
  >({})

  // chat state — reset when agent changes
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatSessionID, setChatSessionID] = useState<string | undefined>()
  const [proposals, setProposals] = useState<unknown[]>([])

  useEffect(() => {
    const data = editorStateQuery.data
    if (!data) return
    const nextMain =
      data.main_agent_id || data.agents.find((a) => a.default)?.id || "main"
    setMainAgentID(nextMain)
    setMainAllowAgents(
      (data.main_allow_agents || []).filter((id) => id !== nextMain),
    )
    setAssistantJIDs(
      (data.assistant_whatsapp_jids || data.admin_whatsapp_jids || []).join(
        "\n",
      ),
    )
    setAssistantChats((data.assistant_whatsapp_chats || []).join("\n"))
    setProfiles(
      Object.fromEntries(
        data.agents.map((a) => [a.id, profileDraftFromInternal(a)]),
      ),
    )
    setRoleConfigDrafts(
      Object.fromEntries(
        data.agents.map((a) => [
          a.id,
          JSON.stringify(a.role_config ?? {}, null, 2),
        ]),
      ),
    )
  }, [editorStateQuery.data])

  useEffect(() => {
    setChatMessages([])
    setChatSessionID(undefined)
    setProposals([])
    if (!selectedAgentId) return
    getInternalAgentProposals(selectedAgentId)
      .then(setProposals)
      .catch(() => setProposals([]))
  }, [selectedAgentId])

  // ── mutations ─────────────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: applyAgentTemplate,
    onSuccess: (_result, appliedDraft) => {
      const agentId = appliedDraft.agent_id ?? selectedAgentId
      toast.success(t("pages.agent.editor.save_success"))
      void appendVersion(
        agentId,
        appliedDraft,
        `Aplicado em ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      ).then(() => {
        void queryClient.invalidateQueries({
          queryKey: ["agent-versions", agentId],
        })
      })
      setEditing(false)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({
        queryKey: ["agent-config", agentId],
      })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("pages.agent.editor.save_error"),
      )
    },
  })

  const wizardMutation = useMutation({
    mutationFn: async ({
      draft,
      payload,
      openAfter,
    }: {
      draft: WizardDraft
      payload: TemplateApplyPayload
      openAfter?: boolean
    }) => {
      const id = payload.agent_id ?? draft.agentID ?? draft.name
      const created = await createAgent({
        id,
        name: payload.name,
        avatar: {
          type: "preset",
          icon: draft.iconID,
          background: draft.background,
          foreground: draft.foreground,
        },
      })
      await applyAgentTemplate(
        substituteAgentPlaceholders({ ...payload, agent_id: created.id }),
      )
      return { created, openAfter: openAfter ?? false }
    },
    onSuccess: ({ created, openAfter }) => {
      toast.success(t("pages.agent.editor.create_success", "Agente criado."))
      setSelectedAgentId(created.id)
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({
        queryKey: ["agent-config", created.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
      if (openAfter) {
        setActiveTab("test")
      } else {
        setActiveTab("identity")
      }
      setCreateOpen(false)
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.editor.create_error",
              "Não foi possível criar o agente.",
            ),
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: (_result, agentId) => {
      toast.success(
        t(
          "pages.agent.editor.delete_success",
          "Agente removido da configuração.",
        ),
      )
      if (selectedAgentId === agentId) setSelectedAgentId("main")
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.editor.delete_error",
              "Não foi possível remover o agente.",
            ),
      )
    },
  })

  const activeMutation = useMutation({
    mutationFn: ({ agentId, active }: { agentId: string; active: boolean }) =>
      updateAgent(agentId, { active }),
    onSuccess: (updated) => {
      toast.success(
        updated.active
          ? t("pages.agent.editor.activate_success", "Agente ativado.")
          : t("pages.agent.editor.deactivate_success", "Agente desativado."),
      )
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.editor.toggle_active_error",
              "Não foi possível alterar o status do agente.",
            ),
      )
    },
  })

  const saveOrchestrationMutation = useMutation({
    mutationFn: async () => {
      const parsedRoleConfigs: Record<string, Record<string, unknown>> = {}
      for (const [id, draftStr] of Object.entries(roleConfigDrafts)) {
        const trimmed = draftStr.trim()
        if (!trimmed) continue
        const parsed = JSON.parse(trimmed) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            t(
              "pages.orchestration.role_config_invalid",
              "Perfil operacional deve ser um objeto JSON.",
            ),
          )
        }
        parsedRoleConfigs[id] = parsed as Record<string, unknown>
      }
      return updateInternalAgentOrchestration({
        main_agent_id: mainAgentID,
        main_allow_agents: mainAllowAgents,
        assistant_whatsapp_jids: splitLines(assistantJIDs),
        assistant_whatsapp_chats: splitLines(assistantChats),
        agent_profiles: Object.fromEntries(
          Object.entries(profiles).map(([id, p]) => [
            id,
            {
              name: p.name.trim(),
              avatar: {
                type: p.imageURL.trim() ? "image" : "preset",
                icon: p.icon.trim(),
                initials: p.initials.trim().slice(0, 4).toUpperCase(),
                background: p.background.trim(),
                foreground: p.foreground.trim(),
                image_url: p.imageURL.trim(),
              },
            },
          ]),
        ),
        agent_role_configs: parsedRoleConfigs,
      })
    },
    onSuccess: () => {
      toast.success(t("pages.orchestration.saved"))
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  // ── editor handlers ───────────────────────────────────────────────────────
  function handleEdit() {
    const payload = configData.payload
    if (!payload) return
    const cloned = JSON.parse(JSON.stringify(payload)) as TemplateApplyPayload
    setDraft(prepareDraftForEdit(cloned, selectedAgentId))
    setEditing(true)
  }

  function parseRawDraft(): TemplateApplyPayload | null {
    try {
      const parsed = JSON.parse(rawDraft) as unknown
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setRawError(
          t("pages.agent.editor.raw_object_required", {
            defaultValue:
              "A configuração do agente precisa ser um objeto JSON.",
          }),
        )
        return null
      }
      const payload = hydrateAgentPayload(parsed as TemplateApplyPayload)
      setRawError(null)
      return { ...payload, agent_id: payload.agent_id ?? selectedAgentId }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("pages.agent.editor.raw_unknown_error", {
              defaultValue: "Erro desconhecido de leitura",
            })
      setRawError(
        t("pages.agent.editor.raw_invalid_json", {
          defaultValue: "JSON inválido: {{message}}",
          message,
        }),
      )
      return null
    }
  }

  function handleOpenRawEditor() {
    const payload = configData.payload
    if (!payload) return
    const cloned = JSON.parse(JSON.stringify(payload)) as TemplateApplyPayload
    setRawDraft(
      JSON.stringify(
        {
          ...hydrateAgentPayload(cloned),
          agent_id: cloned.agent_id ?? selectedAgentId,
        },
        null,
        2,
      ),
    )
    setRawError(null)
    setRawOpen(true)
  }

  function handleSaveRawDraft() {
    const payload = parseRawDraft()
    if (!payload) return
    applyMutation.mutate(payload, { onSuccess: () => setRawOpen(false) })
  }

  function handleRawOpenChange(open: boolean) {
    if (!open && applyMutation.isPending) return
    setRawOpen(open)
    if (!open) setRawError(null)
  }

  function handleCreateOpen() {
    if (!canCreateAgents) {
      toast.warning(
        "A criação de novos agentes está desativada pelo administrador.",
      )
      return
    }
    setCreateOpen(true)
  }

  function handleConfigureSelectedAgent() {
    if (!selectedAgent) return
    const nextDraft = defaultDraftForAgent(selectedAgent, installedSkills)
    setDraft({
      ...nextDraft,
      agent_id: selectedAgent.id,
      name: selectedAgent.name || nextDraft.name,
    })
    setEditing(true)
  }

  function handleDeleteAgent(agent: AgentSummary) {
    if (agent.id === "main") return
    const confirmed = window.confirm(
      t(
        "pages.agent.editor.delete_confirm",
        "Remover este agente da configuração? Os arquivos de workspace serão preservados.",
      ),
    )
    if (confirmed) deleteMutation.mutate(agent.id)
  }

  function handleToggleAgentActive(agent: AgentSummary) {
    const active = agent.active !== false
    if (agent.default && active) {
      toast.error(
        t(
          "pages.agent.editor.default_agent_must_stay_active",
          "O agente padrão precisa continuar ativo.",
        ),
      )
      return
    }
    if (active) {
      setDeactivateOpen(true)
      return
    }
    activeMutation.mutate({ agentId: agent.id, active: true })
  }

  function handleConfirmDeactivate() {
    if (!selectedAgent) return
    activeMutation.mutate(
      { agentId: selectedAgent.id, active: false },
      { onSettled: () => setDeactivateOpen(false) },
    )
  }

  const duplicateMutation = useMutation({
    mutationFn: async (source: AgentEditorAgent) => {
      const base = source.id.replace(/-(copia|copy|copia-\d+)$/i, "")
      const newID = uniqueAgentID(
        `${base}-copia`,
        agents.map((a) => a.id),
      )
      const newName = `${source.name || source.id} (cópia)`
      const created = await createAgent({ id: newID, name: newName })
      const payload = source.prompt?.payload
      if (payload) {
        try {
          await applyAgentTemplate({
            ...JSON.parse(JSON.stringify(payload)),
            agent_id: created.id,
            name: newName,
          })
        } catch {
          // even if the prompt apply fails the agent record is created
        }
      }
      return { created, payload }
    },
    onSuccess: ({ created }) => {
      toast.success(
        t("pages.agent.editor.duplicate_success", "Agente duplicado."),
      )
      setSelectedAgentId(created.id)
      void queryClient.invalidateQueries({ queryKey: ["agent-editor-state"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.editor.duplicate_error",
              "Não foi possível duplicar o agente.",
            ),
      )
    },
  })

  function handleDuplicateAgent(source: AgentEditorAgent) {
    if (!canCreateAgents) {
      toast.warning(
        "A criação de novos agentes está desativada pelo administrador.",
      )
      return
    }
    duplicateMutation.mutate(source)
  }

  function handleRestoreVersion(payload: TemplateApplyPayload) {
    applyMutation.mutate(
      substituteAgentPlaceholders({
        ...payload,
        agent_id: payload.agent_id ?? selectedAgentId,
      }),
      {
        onSuccess: () => setVersionDrawerOpen(false),
      },
    )
  }

  function handleSheetOpenChange(open: boolean) {
    if (!open && !applyMutation.isPending) {
      setEditing(false)
      setDraft(null)
    }
  }

  // ── chat handler ──────────────────────────────────────────────────────────
  const [sendingChat, setSendingChat] = useState(false)
  async function handleSendChat() {
    const content = chatInput.trim()
    if (!selectedAgentId || !content) return
    setSendingChat(true)
    setChatMessages((prev) => [...prev, { role: "user", content }])
    setChatInput("")
    try {
      const response = await sendInternalAgentTurn(
        selectedAgentId,
        content,
        chatSessionID,
      )
      setChatSessionID(response.session_id)
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.content },
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSendingChat(false)
    }
  }

  // ── orchestration helpers ─────────────────────────────────────────────────
  function updateSelectedProfile(patch: Partial<AgentProfileDraft>) {
    if (!selectedAgentId) return
    setProfiles((current) => {
      const existing = current[selectedAgentId]
      if (!existing) return current
      return { ...current, [selectedAgentId]: { ...existing, ...patch } }
    })
  }

  function updateSelectedRoleConfig(
    updater: (current: RoleConfigDraft) => RoleConfigDraft,
  ) {
    if (!selectedAgentId) return
    const current =
      parseRoleConfigDraft(roleConfigDrafts[selectedAgentId] || "{}") ?? {}
    const next = updater(current)
    setRoleConfigDrafts((drafts) => ({
      ...drafts,
      [selectedAgentId]: JSON.stringify(next, null, 2),
    }))
  }

  // ── derived values ────────────────────────────────────────────────────────
  const configured = configData.configured
  const resolvedPayload = useMemo(() => {
    const payload = configData.payload
    if (!payload) return null
    return substituteAgentPlaceholders(hydrateAgentPayload(payload))
  }, [configData.payload])

  const listControls: AgentListControls = useMemo(
    () => ({ search: searchQuery, status: listStatus, sort: listSort }),
    [searchQuery, listStatus, listSort],
  )
  const filteredAgents = useMemo(
    () => applyAgentListControls(agents, listControls),
    [agents, listControls],
  )

  const isLoadingMain = editorStateQuery.isLoading

  const internalAgents = agents
  const selectedProfile = profiles[selectedAgentId]
  const selectedRoleConfigDraft = roleConfigDrafts[selectedAgentId] || "{}"
  const selectedRoleConfig = parseRoleConfigDraft(selectedRoleConfigDraft)
  const quickPrompts = quickPromptsByAgent[selectedAgentId] || []

  // ── P0: dirty tracking, save state, checklist ────────────────────────────
  const baseline = useMemo(() => {
    const data = editorStateQuery.data
    if (!data) return null
    const a = data.agents.find((x) => x.id === selectedAgentId)
    return {
      profile: a ? profileDraftFromInternal(a) : null,
      roleConfig: JSON.stringify(a?.role_config ?? {}, null, 2),
      mainAgentID: data.main_agent_id || "main",
      mainAllowAgents: (data.main_allow_agents || []).filter(
        (id) => id !== (data.main_agent_id || "main"),
      ),
      assistantJIDs: (
        data.assistant_whatsapp_jids ||
        data.admin_whatsapp_jids ||
        []
      ).join("\n"),
      assistantChats: (data.assistant_whatsapp_chats || []).join("\n"),
    }
  }, [editorStateQuery.data, selectedAgentId])

  const isOrchestrationDirty = useMemo(() => {
    if (!baseline) return false
    const currentProfile = selectedProfile
    const profileEq =
      JSON.stringify(currentProfile ?? null) ===
      JSON.stringify(baseline.profile ?? null)
    return !(
      profileEq &&
      selectedRoleConfigDraft === baseline.roleConfig &&
      mainAgentID === baseline.mainAgentID &&
      JSON.stringify(mainAllowAgents) ===
        JSON.stringify(baseline.mainAllowAgents) &&
      assistantJIDs === baseline.assistantJIDs &&
      assistantChats === baseline.assistantChats
    )
  }, [
    baseline,
    selectedProfile,
    selectedRoleConfigDraft,
    mainAgentID,
    mainAllowAgents,
    assistantJIDs,
    assistantChats,
  ])

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  useEffect(() => {
    if (saveOrchestrationMutation.isSuccess) {
      setLastSavedAt(Date.now())
      setSaveErrorMsg(null)
    }
  }, [saveOrchestrationMutation.isSuccess])
  useEffect(() => {
    if (saveOrchestrationMutation.isError) {
      setSaveErrorMsg(
        saveOrchestrationMutation.error instanceof Error
          ? saveOrchestrationMutation.error.message
          : "Erro ao salvar",
      )
    }
  }, [saveOrchestrationMutation.isError, saveOrchestrationMutation.error])

  const saveState: SaveState = saveOrchestrationMutation.isPending
    ? "saving"
    : saveOrchestrationMutation.isError && isOrchestrationDirty
      ? "error"
      : isOrchestrationDirty
        ? "dirty"
        : lastSavedAt
          ? "saved"
          : "idle"

  const handleManualSave = useCallback(() => {
    if (!isOrchestrationDirty || saveOrchestrationMutation.isPending) return
    saveOrchestrationMutation.mutate()
  }, [isOrchestrationDirty, saveOrchestrationMutation])

  const handleDiscardOrchestration = useCallback(() => {
    if (!baseline || !selectedAgentId) return
    setRoleConfigDrafts((d) => ({
      ...d,
      [selectedAgentId]: baseline.roleConfig,
    }))
    setMainAgentID(baseline.mainAgentID)
    setMainAllowAgents(baseline.mainAllowAgents)
    setAssistantJIDs(baseline.assistantJIDs)
    setAssistantChats(baseline.assistantChats)
    if (baseline.profile) {
      setProfiles((current) => ({
        ...current,
        [selectedAgentId]: baseline.profile!,
      }))
    }
    setSaveErrorMsg(null)
  }, [baseline, selectedAgentId])

  useSaveShortcut(handleManualSave)
  useDirtyGuard(
    isOrchestrationDirty,
    "Há alterações não salvas no agente. Deseja sair mesmo assim?",
  )

  const checklistSteps = useMemo(
    () =>
      validateChecklist({
        payload: selectedPrompt?.payload ?? null,
        roleConfigDraft: selectedRoleConfigDraft,
        mainAgentID,
        assistantPhones: splitLines(assistantJIDs)
          .map(jidToPhone)
          .filter(Boolean),
        assistantGroups: splitLines(assistantChats),
      }),
    [
      selectedPrompt?.payload,
      selectedRoleConfigDraft,
      mainAgentID,
      assistantJIDs,
      assistantChats,
    ],
  )
  const isReady = isReadyToActivate(checklistSteps)

  // ── P0: active conversations for deactivate dialog ───────────────────────
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const activeConversationsQuery = useQuery({
    queryKey: ["whatsapp", "chats", "active", selectedAgentId],
    queryFn: async (): Promise<ActiveConversation[]> => {
      try {
        const chats = await listWhatsAppChats(20)
        return chats
          .filter((c) => !c.paused)
          .slice(0, 8)
          .map((c) => ({
            id: c.jid,
            contactLabel: c.display_name || c.push_name || jidToPhone(c.jid),
            channel: "WhatsApp",
          }))
      } catch {
        return []
      }
    },
    enabled: deactivateOpen,
  })

  return (
    <div className="flex h-full">
      <div className="agent-editor flex min-w-0 flex-1 flex-col">
        <PageHeader title="" className="justify-end">
          {selectedAgent && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVersionDrawerOpen(true)}
                className="h-8 gap-1.5"
              >
                <IconHistory className="size-4" aria-hidden="true" />
                Versões
              </Button>
              <Button
                type="button"
                variant={chatDrawerOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setChatDrawerOpen((o) => !o)}
                aria-pressed={chatDrawerOpen}
                className="h-8 gap-1.5"
              >
                <IconMessageDots className="size-4" aria-hidden="true" />
                Chat de teste
              </Button>
            </>
          )}
        </PageHeader>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto grid h-full w-full max-w-6xl gap-0 lg:grid-cols-[272px_minmax(0,1fr)]">
            {/* ── sidebar ──────────────────────────────────────────── */}
            <aside className="border-border/60 bg-background/60 flex flex-col border-r">
              <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-3">
                <div className="flex items-center gap-2">
                  <IconUsers className="text-muted-foreground size-4 shrink-0" />
                  <span className="text-sm font-semibold">
                    {t("pages.agent.editor.agents", "Agentes")}
                  </span>
                  {agents.length > 0 && (
                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                      {agents.length}
                    </span>
                  )}
                </div>
                {canCreateAgents && (
                  <Button
                    size="sm"
                    onClick={handleCreateOpen}
                    className="h-7 gap-1 px-2.5 text-xs"
                  >
                    <IconPlus className="size-3.5" />
                    {t("pages.agent.editor.new_agent", "Novo agente")}
                  </Button>
                )}
              </div>

              <div className="border-border/60 space-y-2 border-b px-3 py-2.5">
                <div className="relative">
                  <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar agente…"
                    className="h-8 rounded-md pl-8 text-xs"
                    aria-label="Buscar agentes"
                  />
                </div>
                <div
                  role="group"
                  aria-label="Filtrar agentes"
                  className="flex flex-wrap items-center gap-1"
                >
                  {(["all", "active", "inactive"] as const).map((s) => {
                    const active = listStatus === s
                    const label =
                      s === "all"
                        ? "Todos"
                        : s === "active"
                          ? "Ativos"
                          : "Inativos"
                    return (
                      <Button
                        key={s}
                        type="button"
                        onClick={() => setListStatus(s)}
                        aria-pressed={active}
                        variant={active ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-6 rounded-md px-2 text-[10px] font-medium",
                          !active && "text-muted-foreground",
                        )}
                      >
                        {label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {editorStateQuery.isLoading ? (
                  <div className="space-y-1 p-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                      >
                        <Skeleton className="size-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-3/4 rounded" />
                          <Skeleton className="h-2.5 w-1/2 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-xs">
                    <IconSearch className="size-6 opacity-40" />
                    <p>Nenhum agente encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 p-2">
                    {filteredAgents.map((agent) => {
                      const isSelected = agent.id === selectedAgentId
                      const isActive = agent.active !== false
                      return (
                        <div
                          key={agent.id}
                          className={`group focus-within:ring-ring relative flex min-w-0 items-center gap-1 rounded-lg pr-1 transition-colors focus-within:ring-2 ${
                            isSelected
                              ? "bg-muted ring-border/60 ring-1"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          {isSelected && (
                            <span className="bg-primary absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />
                          )}
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            aria-current={isSelected ? "true" : undefined}
                            onClick={() => setSelectedAgentId(agent.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left focus:outline-none"
                          >
                            <AgentAvatar agent={agent} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`truncate text-sm font-medium ${
                                    isSelected
                                      ? "text-foreground"
                                      : "text-foreground/80 group-hover:text-foreground"
                                  }`}
                                >
                                  {agent.name || agent.id}
                                </span>
                                {!isActive && (
                                  <span className="size-1.5 shrink-0 rounded-full bg-red-400" />
                                )}
                              </div>
                              <p className="text-muted-foreground/70 mt-1 truncate text-[11px]">
                                {agentRoleLabel(agent)}
                              </p>
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Mais ações para ${agent.name || agent.id}`}
                                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-7 shrink-0 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                              >
                                <IconDotsVertical
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => setSelectedAgentId(agent.id)}
                              >
                                <IconEdit className="size-3.5" />
                                Selecionar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDuplicateAgent(agent)}
                                disabled={
                                  duplicateMutation.isPending ||
                                  !canCreateAgents
                                }
                              >
                                <IconCopy className="size-3.5" />
                                Duplicar agente
                              </DropdownMenuItem>
                              {agent.id !== "main" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteAgent(agent)}
                                    disabled={deleteMutation.isPending}
                                    className="text-red-700 focus:bg-red-500/10 focus:text-red-700 dark:text-red-300 dark:focus:bg-red-500/20"
                                  >
                                    <IconTrash className="size-3.5" />
                                    Remover
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </aside>

            {/* ── main content ─────────────────────────────────────── */}
            <main className="flex min-w-0 flex-col overflow-hidden">
              {/* mobile agent selector */}
              <div className="border-border/40 flex items-center gap-2 border-b px-4 py-2.5 lg:hidden">
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.name || a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canCreateAgents && (
                  <Button size="sm" onClick={handleCreateOpen} className="h-8">
                    <IconPlus className="size-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {isLoadingMain ? (
                  <LoadingSkeleton />
                ) : !selectedAgent ? (
                  <EmptyState
                    onCreate={handleCreateOpen}
                    canCreate={canCreateAgents}
                  />
                ) : (
                  <UnifiedAgentEditor
                    agent={selectedAgent}
                    configured={configured}
                    configData={configData}
                    resolvedPayload={resolvedPayload}
                    template={template}
                    selectedAgentId={selectedAgentId}
                    selectedProfile={selectedProfile}
                    selectedRoleConfigDraft={selectedRoleConfigDraft}
                    selectedRoleConfig={selectedRoleConfig}
                    mainAgentID={mainAgentID}
                    mainAllowAgents={mainAllowAgents}
                    assistantJIDs={assistantJIDs}
                    assistantChats={assistantChats}
                    internalAgents={internalAgents}
                    isSavingOrchestration={saveOrchestrationMutation.isPending}
                    isLoadingOrchestration={editorStateQuery.isLoading}
                    isTogglingActive={activeMutation.isPending}
                    isDeleting={deleteMutation.isPending}
                    checklistSteps={checklistSteps}
                    isReadyToActivate={isReady}
                    saveState={saveState}
                    lastSavedAt={lastSavedAt}
                    saveErrorMsg={saveErrorMsg}
                    onSave={handleManualSave}
                    onDiscard={handleDiscardOrchestration}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    advancedJsonMode={advancedJsonMode}
                    onAdvancedJsonModeChange={setAdvancedJsonMode}
                    messages={chatMessages}
                    chatInput={chatInput}
                    isSending={sendingChat}
                    proposals={proposals}
                    quickPrompts={quickPrompts}
                    canCreate={canCreateAgents}
                    onCreate={handleCreateOpen}
                    onConfigure={handleConfigureSelectedAgent}
                    onEditPrompt={handleEdit}
                    onOpenRawEditor={handleOpenRawEditor}
                    onToggleActive={() =>
                      handleToggleAgentActive(selectedAgent)
                    }
                    onDelete={
                      selectedAgent.id !== "main"
                        ? () => handleDeleteAgent(selectedAgent)
                        : undefined
                    }
                    onUpdateProfile={updateSelectedProfile}
                    onUpdateRoleConfig={updateSelectedRoleConfig}
                    onRoleConfigDraftChange={(v) =>
                      setRoleConfigDrafts((d) => ({
                        ...d,
                        [selectedAgentId]: v,
                      }))
                    }
                    onMainAgentChange={(id) => {
                      setMainAgentID(id)
                      setMainAllowAgents((c) => c.filter((x) => x !== id))
                    }}
                    onToggleMainAllow={(id) =>
                      setMainAllowAgents((c) =>
                        c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
                      )
                    }
                    onAssistantJIDsChange={setAssistantJIDs}
                    onAssistantChatsChange={setAssistantChats}
                    onRefreshOrchestration={() =>
                      void queryClient.invalidateQueries({
                        queryKey: ["agent-editor-state"],
                      })
                    }
                    onChatInputChange={setChatInput}
                    onSendChat={handleSendChat}
                    onPromptSelect={setChatInput}
                    onProposalInspect={(proposal) =>
                      setChatInput(
                        `Revise esta proposta salva e me diga quais arquivos foram gerados, próximos ajustes e pendências:\n\n${JSON.stringify(proposal, null, 2)}`,
                      )
                    }
                  />
                )}
              </div>
            </main>
          </div>
        </div>

        {/* ── dialogs ───────────────────────────────────────────────── */}
        <AgentWizard
          open={createOpen && canCreateAgents}
          existingIDs={agents.map((a) => a.id)}
          isSubmitting={wizardMutation.isPending}
          onSubmit={(draft, payload) =>
            wizardMutation.mutate({ draft, payload })
          }
          onTest={(draft, payload) =>
            wizardMutation.mutate({ draft, payload, openAfter: true })
          }
          onCancel={() => setCreateOpen(false)}
        />

        <Dialog open={rawOpen} onOpenChange={handleRawOpenChange}>
          <DialogContent className="flex h-[min(86vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <DialogHeader className="border-border/40 border-b px-6 py-4 pr-14">
              <DialogTitle>
                {t("pages.agent.editor.raw_json_title", "JSON bruto do agente")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "pages.agent.editor.raw_json_description",
                  "Editor avançado do payload exato salvo no workspace deste agente.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 p-4">
              <CodeEditor
                value={rawDraft}
                onChange={(value) => {
                  setRawDraft(value)
                  if (rawError) setRawError(null)
                }}
                language="json"
                path={`${selectedAgentId}/agent_config.json`}
                ariaLabel={t(
                  "pages.agent.editor.raw_json_title",
                  "JSON bruto do agente",
                )}
                className="h-full min-h-[360px]"
              />
            </div>
            <div className="border-border/40 flex min-h-10 items-center justify-between gap-3 border-t px-6 py-3 text-xs">
              <div className="min-w-0 flex-1">
                {rawError ? (
                  <span className="flex items-center gap-1 text-red-700 dark:text-red-300">
                    <IconAlertTriangle className="size-3 shrink-0" />
                    <span className="truncate">{rawError}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("pages.agent.editor.raw_char_count", {
                      count: rawDraft.length,
                      defaultValue: "{{count}} caracteres",
                    })}
                  </span>
                )}
              </div>
              <DialogFooter className="shrink-0">
                <Button
                  variant="outline"
                  onClick={() => handleRawOpenChange(false)}
                  disabled={applyMutation.isPending}
                >
                  {t("pages.agent.templates.cancel")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const p = parseRawDraft()
                    if (p) setRawDraft(JSON.stringify(p, null, 2))
                  }}
                  disabled={applyMutation.isPending}
                >
                  <IconBraces className="size-4" />
                  {t("pages.agent.editor.raw_format", "Formatar")}
                </Button>
                <Button
                  onClick={handleSaveRawDraft}
                  disabled={applyMutation.isPending}
                >
                  {applyMutation.isPending ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconCheck className="size-4" />
                  )}
                  {t("pages.agent.editor.raw_save", "Salvar JSON")}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {agentKind(selectedAgentId) === "attendant" ? (
          <TemplateConfigSheet
            open={editing}
            template={template}
            draft={draft}
            isApplying={applyMutation.isPending}
            isSavingTemplate={false}
            isResettingTemplate={false}
            hasSavedOverride={false}
            installedSkills={installedSkills}
            onDraftChange={setDraft}
            onApply={() => {
              if (draft) {
                applyMutation.mutate(
                  substituteAgentPlaceholders({
                    ...draft,
                    agent_id: draft.agent_id ?? selectedAgentId,
                  }),
                )
              }
            }}
            onSaveTemplate={() => {}}
            onResetTemplate={() => {}}
            onOpenChange={handleSheetOpenChange}
          />
        ) : (
          <SpecialistPromptSheet
            open={editing}
            agent={selectedAgent}
            draft={draft}
            installedSkills={installedSkills}
            isApplying={applyMutation.isPending}
            onDraftChange={setDraft}
            onApply={() => {
              if (draft) {
                applyMutation.mutate(
                  substituteAgentPlaceholders({
                    ...draft,
                    agent_id: draft.agent_id ?? selectedAgentId,
                  }),
                )
              }
            }}
            onOpenChange={handleSheetOpenChange}
          />
        )}

        {selectedAgent && (
          <DeactivateAgentDialog
            open={deactivateOpen}
            agentName={selectedAgent.name || selectedAgent.id}
            conversations={activeConversationsQuery.data ?? []}
            isLoadingConversations={activeConversationsQuery.isLoading}
            isSubmitting={activeMutation.isPending}
            onConfirm={handleConfirmDeactivate}
            onCancel={() => setDeactivateOpen(false)}
          />
        )}

        {selectedAgent && (
          <VersionHistoryDrawer
            open={versionDrawerOpen}
            agentID={selectedAgent.id}
            currentPayload={configData.payload ?? null}
            onRestore={handleRestoreVersion}
            onOpenChange={setVersionDrawerOpen}
          />
        )}

        {selectedAgent && (
          <ChatTestDrawer
            open={chatDrawerOpen}
            agentName={selectedAgent.name || selectedAgent.id}
            onOpenChange={setChatDrawerOpen}
          >
            <ChatTab
              selectedAgentId={selectedAgentId}
              selectedProfile={selectedProfile}
              messages={chatMessages}
              chatInput={chatInput}
              isSending={sendingChat}
              proposals={proposals}
              quickPrompts={quickPrompts}
              onChatInputChange={setChatInput}
              onSend={handleSendChat}
              onPromptSelect={setChatInput}
              onProposalInspect={(proposal) =>
                setChatInput(
                  `Revise esta proposta salva e me diga quais arquivos foram gerados, próximos ajustes e pendências:\n\n${JSON.stringify(proposal, null, 2)}`,
                )
              }
            />
          </ChatTestDrawer>
        )}
      </div>
      <PendingHandoffsSidebar className="hidden xl:flex" />
    </div>
  )
}

// ─── unified editor sections ─────────────────────────────────────────────────

function UnifiedAgentEditor({
  agent,
  configured,
  configData,
  resolvedPayload,
  template,
  selectedAgentId,
  selectedProfile,
  selectedRoleConfigDraft,
  selectedRoleConfig,
  mainAgentID,
  mainAllowAgents,
  assistantJIDs,
  assistantChats,
  internalAgents,
  isSavingOrchestration,
  isLoadingOrchestration,
  isTogglingActive,
  isDeleting,
  messages,
  chatInput,
  isSending,
  proposals,
  quickPrompts,
  canCreate,
  onCreate,
  onConfigure,
  onEditPrompt,
  onOpenRawEditor,
  onToggleActive,
  onDelete,
  onUpdateProfile,
  onUpdateRoleConfig,
  onRoleConfigDraftChange,
  onMainAgentChange,
  onToggleMainAllow,
  onAssistantJIDsChange,
  onAssistantChatsChange,
  onRefreshOrchestration,
  onChatInputChange,
  onSendChat,
  onPromptSelect,
  onProposalInspect,
  checklistSteps,
  isReadyToActivate: ready,
  saveState,
  lastSavedAt,
  saveErrorMsg,
  onSave,
  onDiscard,
  activeTab,
  onTabChange,
  advancedJsonMode,
  onAdvancedJsonModeChange,
}: {
  agent: AgentEditorAgent
  configured: boolean
  configData: AgentConfigResponse
  resolvedPayload: TemplateApplyPayload | null
  template: AgentTemplate | null
  selectedAgentId: string
  selectedProfile?: AgentProfileDraft
  selectedRoleConfigDraft: string
  selectedRoleConfig: RoleConfigDraft | null
  mainAgentID: string
  mainAllowAgents: string[]
  assistantJIDs: string
  assistantChats: string
  internalAgents: AgentEditorAgent[]
  isSavingOrchestration: boolean
  isLoadingOrchestration: boolean
  isTogglingActive: boolean
  isDeleting: boolean
  messages: ChatMessage[]
  chatInput: string
  isSending: boolean
  proposals: unknown[]
  quickPrompts: Array<{
    icon: React.ElementType
    label: string
    prompt: string
  }>
  canCreate: boolean
  onCreate: () => void
  onConfigure: () => void
  onEditPrompt: () => void
  onOpenRawEditor: () => void
  onToggleActive: () => void
  onDelete?: () => void
  onUpdateProfile: (patch: Partial<AgentProfileDraft>) => void
  onUpdateRoleConfig: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
  onRoleConfigDraftChange: (v: string) => void
  onMainAgentChange: (id: string) => void
  onToggleMainAllow: (id: string) => void
  onAssistantJIDsChange: (v: string) => void
  onAssistantChatsChange: (v: string) => void
  onRefreshOrchestration: () => void
  onChatInputChange: (v: string) => void
  onSendChat: () => void
  onPromptSelect: (v: string) => void
  onProposalInspect: (proposal: unknown) => void
  checklistSteps: ReturnType<typeof validateChecklist>
  isReadyToActivate: boolean
  saveState: SaveState
  lastSavedAt: number | null
  saveErrorMsg: string | null
  onSave: () => void
  onDiscard: () => void
  activeTab: AgentEditorTab
  onTabChange: (tab: AgentEditorTab) => void
  advancedJsonMode: boolean
  onAdvancedJsonModeChange: (next: boolean) => void
}) {
  void ready
  return (
    <div className="animate-in fade-in-0 flex flex-col gap-5 pb-0 duration-200">
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as AgentEditorTab)}
        className="gap-3"
      >
        <TabsNav steps={checklistSteps} />

        <TabsContent value="identity" id="section-identity">
          <IdentityProfileSection
            agent={agent}
            selectedProfile={selectedProfile}
            isTogglingActive={isTogglingActive}
            isDeleting={isDeleting}
            onUpdateProfile={onUpdateProfile}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        </TabsContent>

        <TabsContent value="role" id="section-role">
          <OperationalRoleSection
            selectedAgentId={selectedAgentId}
            selectedRoleConfig={selectedRoleConfig}
            selectedRoleConfigDraft={selectedRoleConfigDraft}
            advancedMode={advancedJsonMode}
            onUpdateRoleConfig={onUpdateRoleConfig}
            onRoleConfigDraftChange={onRoleConfigDraftChange}
            onAdvancedModeChange={onAdvancedJsonModeChange}
          />
        </TabsContent>

        <TabsContent value="prompt" id="section-prompt">
          <div className="space-y-4">
            <PromptWorkspaceSection
              agent={agent}
              configured={configured}
              configData={configData}
              resolvedPayload={resolvedPayload}
              template={template}
              canCreate={canCreate}
              onCreate={onCreate}
              onConfigure={onConfigure}
              onEditPrompt={onEditPrompt}
              onOpenRawEditor={onOpenRawEditor}
            />
            <PromptPreview
              payload={resolvedPayload ?? configData.payload ?? null}
            />
          </div>
        </TabsContent>

        <TabsContent value="knowledge" id="section-knowledge">
          <PromptWorkspaceSection
            agent={agent}
            configured={configured}
            configData={configData}
            resolvedPayload={resolvedPayload}
            template={template}
            canCreate={canCreate}
            onCreate={onCreate}
            onConfigure={onConfigure}
            onEditPrompt={onEditPrompt}
            onOpenRawEditor={onOpenRawEditor}
          />
        </TabsContent>

        <TabsContent value="routing" id="section-routing">
          <AccessRoutingSection
            selectedAgentId={selectedAgentId}
            agent={agent}
            mainAgentID={mainAgentID}
            mainAllowAgents={mainAllowAgents}
            assistantJIDs={assistantJIDs}
            assistantChats={assistantChats}
            internalAgents={internalAgents}
            isSaving={isSavingOrchestration}
            isLoading={isLoadingOrchestration}
            onMainAgentChange={onMainAgentChange}
            onToggleMainAllow={onToggleMainAllow}
            onAssistantJIDsChange={onAssistantJIDsChange}
            onAssistantChatsChange={onAssistantChatsChange}
            onRefresh={onRefreshOrchestration}
          />
        </TabsContent>

        <TabsContent value="test" id="section-test">
          <section id="agent-chat-section">
            <ChatTab
              selectedAgentId={selectedAgentId}
              selectedProfile={selectedProfile}
              messages={messages}
              chatInput={chatInput}
              isSending={isSending}
              proposals={proposals}
              quickPrompts={quickPrompts}
              onChatInputChange={onChatInputChange}
              onSend={onSendChat}
              onPromptSelect={onPromptSelect}
              onProposalInspect={onProposalInspect}
            />
          </section>
        </TabsContent>
      </Tabs>

      <SaveBar
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        errorMessage={saveErrorMsg}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </div>
  )
}

function IdentityProfileSection({
  agent,
  selectedProfile,
  isTogglingActive,
  isDeleting,
  onUpdateProfile,
  onToggleActive,
  onDelete,
}: {
  agent: AgentEditorAgent
  selectedProfile?: AgentProfileDraft
  isTogglingActive: boolean
  isDeleting: boolean
  onUpdateProfile: (patch: Partial<AgentProfileDraft>) => void
  onToggleActive: () => void
  onDelete?: () => void
}) {
  const isActive = agent.active !== false

  return (
    <section className="space-y-4">
      <div
        className={cn(
          editorPanelClass,
          "flex flex-col gap-4 sm:flex-row sm:items-start",
        )}
      >
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-foreground text-xl font-semibold tracking-tight">
              {selectedProfile?.name || agent.name || agent.id}
            </h2>
            {agent.default && <DefaultBadge />}
            <StatusBadge active={isActive} />
          </div>
          <p className="text-muted-foreground text-sm">
            {agentRoleLabel(agent)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isActive && (
            <Button
              variant="default"
              size="sm"
              onClick={onToggleActive}
              disabled={isTogglingActive}
              className="gap-1.5"
            >
              {isTogglingActive ? (
                <IconLoader2
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <IconPlayerPlay className="size-4" aria-hidden="true" />
              )}
              Ativar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Ações para ${agent.name || agent.id}`}
                className="gap-1"
              >
                <IconDotsVertical className="size-4" aria-hidden="true" />
                Mais
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isActive && (
                <DropdownMenuItem
                  onClick={onToggleActive}
                  disabled={isTogglingActive || (agent.default && isActive)}
                  className="text-amber-700 focus:bg-amber-50 focus:text-amber-800 dark:text-amber-300 dark:focus:bg-amber-950/40"
                >
                  {isTogglingActive ? (
                    <IconLoader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconPlayerPause className="size-3.5" aria-hidden="true" />
                  )}
                  Desativar atendimento
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  {isActive && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="text-red-700 focus:bg-red-500/10 focus:text-red-700 dark:text-red-300 dark:focus:bg-red-500/20"
                  >
                    {isDeleting ? (
                      <IconLoader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <IconTrash className="size-3.5" aria-hidden="true" />
                    )}
                    Remover agente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedProfile && (
        <div className={editorPanelClass}>
          <SectionHeader title="Identidade" icon={IconUserShield} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do agente</Label>
              <Input
                value={selectedProfile.name}
                onChange={(e) => onUpdateProfile({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Imagem</Label>
              <AvatarUpload
                value={selectedProfile.imageURL}
                onChange={(next) => onUpdateProfile({ imageURL: next })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function OperationalRoleSection({
  selectedAgentId,
  selectedRoleConfig,
  selectedRoleConfigDraft,
  advancedMode,
  onUpdateRoleConfig,
  onRoleConfigDraftChange,
  onAdvancedModeChange,
}: {
  selectedAgentId: string
  selectedRoleConfig: RoleConfigDraft | null
  selectedRoleConfigDraft: string
  advancedMode: boolean
  onUpdateRoleConfig: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
  onRoleConfigDraftChange: (v: string) => void
  onAdvancedModeChange: (next: boolean) => void
}) {
  const advancedToggleID = `${selectedAgentId}-advanced-mode`
  const jsonError = useMemo(() => {
    if (!advancedMode || !selectedRoleConfigDraft.trim()) return null
    try {
      const parsed = JSON.parse(selectedRoleConfigDraft) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "JSON deve ser um objeto"
      }
      return null
    } catch (err) {
      return err instanceof Error ? err.message : "JSON inválido"
    }
  }, [advancedMode, selectedRoleConfigDraft])

  function handleToggle(next: boolean) {
    if (!next && jsonError) {
      toast.error(
        `Não foi possível sair do modo avançado: ${jsonError}. Corrija o JSON ou descarte as alterações.`,
      )
      return
    }
    onAdvancedModeChange(next)
  }

  return (
    <section className={editorPanelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <SectionHeader title="Papel operacional" icon={IconSparkles} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="O que é papel operacional"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                <span aria-hidden="true">?</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Define a função do agente no negócio (atendente, vendas,
              marketing, assistente). Campos como triagem, escalonamento e fonte
              de FAQ ficam aqui, e são consumidos por canais e regras antes do
              prompt.
            </TooltipContent>
          </Tooltip>
        </div>
        <label
          htmlFor={advancedToggleID}
          className="border-border/60 bg-background flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium"
        >
          <Switch
            id={advancedToggleID}
            checked={advancedMode}
            onCheckedChange={handleToggle}
            aria-describedby={`${advancedToggleID}-desc`}
          />
          Modo avançado (JSON)
        </label>
      </div>
      <p
        id={`${advancedToggleID}-desc`}
        className="text-muted-foreground mt-1 mb-3 text-xs"
      >
        {advancedMode
          ? "Atenção: você está editando o JSON cru. Os campos guiados ficam bloqueados. Saída inválida impede salvar."
          : "Campos guiados protegem contra erros. Ative o modo avançado apenas se precisar editar campos que não aparecem aqui."}
      </p>
      {advancedMode ? (
        <div className="space-y-2">
          <Textarea
            value={selectedRoleConfigDraft}
            onChange={(e) => onRoleConfigDraftChange(e.target.value)}
            className="min-h-64 font-mono text-xs"
            spellCheck={false}
            aria-label="JSON do papel operacional"
            aria-invalid={jsonError ? true : undefined}
          />
          {jsonError && (
            <p role="alert" className="text-destructive text-xs">
              {jsonError}
            </p>
          )}
        </div>
      ) : selectedRoleConfig ? (
        <RoleSpecificConfigEditor
          config={selectedRoleConfig}
          onChange={onUpdateRoleConfig}
        />
      ) : (
        <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Nenhum perfil operacional encontrado para {selectedAgentId}.
        </div>
      )}
    </section>
  )
}

function PromptWorkspaceSection({
  agent,
  configured,
  configData,
  resolvedPayload,
  template,
  canCreate,
  onCreate,
  onConfigure,
  onEditPrompt,
  onOpenRawEditor,
}: {
  agent: AgentEditorAgent
  configured: boolean
  configData: AgentConfigResponse
  resolvedPayload: TemplateApplyPayload | null
  template: AgentTemplate | null
  canCreate: boolean
  onCreate: () => void
  onConfigure: () => void
  onEditPrompt: () => void
  onOpenRawEditor: () => void
}) {
  const payload = configData.payload
  const appliedAt = configData.applied_at
    ? new Date(configData.applied_at * 1000).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null
  const activeSkillCount = enabledSkillCount(payload)
  const promptLabel =
    agent.id === "main"
      ? (template?.name ?? payload?.template_id)
      : promptSheetTitle(agent)
  const presentation = resolvedPayload?.presentation ?? payload?.presentation

  return (
    <section className="space-y-4">
      <div className={editorPanelClass}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <SectionHeader title="Prompt & Workspace" icon={IconSettings} />
            <h3 className="text-lg font-semibold">
              {configured ? promptLabel : "Prompt do workspace pendente"}
            </h3>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {configured
                ? presentation ||
                  "Arquivos de runtime já foram gerados para este agente."
                : "A identidade e o roteamento podem ser salvos antes do prompt. Quando aplicar, serão gerados AGENT.md, SOUL.md, behavior.json e agent_config.json."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
            <Button
              onClick={configured ? onEditPrompt : onConfigure}
              size="default"
              className="gap-2"
            >
              <IconEdit className="size-4" />
              {configured
                ? promptEditLabel(agent)
                : "Criar prompt do workspace"}
            </Button>
            {configured && (
              <Button
                variant="outline"
                onClick={onOpenRawEditor}
                size="default"
                className="gap-2"
              >
                <IconBraces className="size-4" />
                JSON bruto do prompt
              </Button>
            )}
            {!configured && canCreate && (
              <Button
                variant="outline"
                onClick={onCreate}
                size="default"
                className="gap-2"
              >
                <IconPlus className="size-4" />
                Novo agente
              </Button>
            )}
            {!configured && !canCreate && (
              <p className="text-muted-foreground max-w-52 text-right text-xs leading-relaxed">
                Criação de novos agentes desativada pelo administrador.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <WorkspaceDisplay
            workspace={agent.workspace}
            isDefault={agent.default}
          />
          {appliedAt && (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              Última aplicação: {appliedAt}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/agent/skills"
                search={{ agent: agent.id }}
                className="border-border/60 bg-muted/40 hover:bg-muted hover:border-foreground/30 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                Skills no prompt: {configured ? activeSkillCount : "—"}
                <IconExternalLink
                  className="text-muted-foreground size-3"
                  aria-hidden="true"
                />
              </Link>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Abrir o editor de skills filtrado por este agente. Cada skill é
              descrita no prompt para o LLM saber quando usar.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {agent.id === "marketing" && <MarketingPublishingPanel agent={agent} />}
    </section>
  )
}

function AccessRoutingSection({
  selectedAgentId,
  agent,
  mainAgentID,
  mainAllowAgents,
  assistantJIDs,
  assistantChats,
  internalAgents,
  isSaving,
  isLoading,
  onMainAgentChange,
  onToggleMainAllow,
  onAssistantJIDsChange,
  onAssistantChatsChange,
  onRefresh,
}: {
  selectedAgentId: string
  agent: AgentEditorAgent
  mainAgentID: string
  mainAllowAgents: string[]
  assistantJIDs: string
  assistantChats: string
  internalAgents: AgentEditorAgent[]
  isSaving: boolean
  isLoading: boolean
  onMainAgentChange: (id: string) => void
  onToggleMainAllow: (id: string) => void
  onAssistantJIDsChange: (v: string) => void
  onAssistantChatsChange: (v: string) => void
  onRefresh: () => void
}) {
  const mainAgent = internalAgents.find((a) => a.id === mainAgentID)
  const subagentOptions = internalAgents.filter((a) => a.id !== mainAgentID)
  const selectedSubagents = agent.subagents?.allow_agents ?? []

  return (
    <section className={editorPanelClass}>
      <SectionHeader title="Acesso & Roteamento" icon={IconShield} />
      <p className="text-muted-foreground mt-1 text-xs">
        Esta seção salva acesso, agente principal e delegação em config.json.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <LabelWithTooltip
              htmlFor={`${selectedAgentId}-main-agent`}
              tooltip="O agente principal é quem responde sozinho quando alguém escreve no WhatsApp público. Ele pode delegar tarefas para os subagentes marcados abaixo."
            >
              Agente principal público
            </LabelWithTooltip>
            <Select
              value={mainAgentID}
              onValueChange={onMainAgentChange}
              disabled={isLoading || internalAgents.length === 0}
            >
              <SelectTrigger
                id={`${selectedAgentId}-main-agent`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {internalAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name || a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mainAgent && (
              <p className="text-muted-foreground text-xs">
                Selecionado:{" "}
                <span className="font-medium">
                  {mainAgent.name || mainAgent.id}
                </span>
              </p>
            )}
          </div>

          {subagentOptions.length > 0 && (
            <div className="space-y-2">
              <LabelWithTooltip tooltip="Quais especialistas o agente principal pode chamar quando precisar de ajuda em vendas, marketing ou outras áreas.">
                Delegação para especialistas
              </LabelWithTooltip>
              {subagentOptions.map((item) => (
                <label
                  key={item.id}
                  className="border-border/60 hover:bg-muted/40 flex min-h-10 cursor-pointer items-center justify-between rounded-lg border px-3 text-sm"
                >
                  <span className="font-medium">{item.name || item.id}</span>
                  <Switch
                    checked={mainAllowAgents.includes(item.id)}
                    onCheckedChange={() => onToggleMainAllow(item.id)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoCard
              label="Acesso painel"
              value={
                agent.access?.panel_enabled === false ? "desativado" : "ativo"
              }
            />
            <InfoCard
              label="WhatsApp direto"
              value={
                agent.access?.whatsapp_direct_enabled ? "ativo" : "restrito"
              }
            />
            <InfoCard
              label="Especialistas chamados"
              value={
                selectedSubagents.length
                  ? `${selectedSubagents.length}`
                  : "nenhum"
              }
            />
          </div>

          <div className="space-y-1.5">
            <LabelWithTooltip
              htmlFor={`${selectedAgentId}-assistant-phones`}
              tooltip="Telefones que podem usar a Sofia (assistente do dono) para tarefas administrativas no WhatsApp pessoal."
            >
              Telefones autorizados da Sofia
            </LabelWithTooltip>
            <WhatsAppPhoneList
              id={`${selectedAgentId}-assistant-phones`}
              jids={splitLines(assistantJIDs)}
              onChange={(jids) => onAssistantJIDsChange(jids.join("\n"))}
              ariaLabel="Telefones autorizados da Sofia"
            />
          </div>
          <div className="space-y-1.5">
            <LabelWithTooltip
              htmlFor={`${selectedAgentId}-assistant-groups`}
              tooltip="Grupos onde a Sofia pode atuar. Vincule pelo convite do grupo ou pelo ID numérico."
            >
              Grupos vinculados da Sofia
            </LabelWithTooltip>
            <WhatsAppGroupList
              id={`${selectedAgentId}-assistant-groups`}
              jids={splitLines(assistantChats)}
              onChange={(jids) => onAssistantChatsChange(jids.join("\n"))}
              ariaLabel="Grupos vinculados da Sofia"
            />
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 text-[11px]">
        Use a barra de salvamento no rodapé para confirmar as alterações.
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="text-foreground/80 hover:text-foreground ml-2 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Recarregar do servidor
        </button>
      </p>
      <span className="sr-only">
        {isSaving ? "Salvando alterações" : "Pronto"}
      </span>
    </section>
  )
}

function SpecialistPromptSheet({
  open,
  agent,
  draft,
  installedSkills,
  isApplying,
  onDraftChange,
  onApply,
  onOpenChange,
}: {
  open: boolean
  agent: AgentSummary | null
  draft: TemplateApplyPayload | null
  installedSkills: SkillSupportItem[]
  isApplying: boolean
  onDraftChange: (draft: TemplateApplyPayload | null) => void
  onApply: () => void
  onOpenChange: (open: boolean) => void
}) {
  if (!draft || !agent) {
    return null
  }
  const setField = <K extends keyof TemplateApplyPayload>(
    key: K,
    value: TemplateApplyPayload[K],
  ) => {
    onDraftChange({ ...draft, [key]: value })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border/40 border-b px-6 py-4 pr-14">
          <DialogTitle>{promptSheetTitle(agent)}</DialogTitle>
          <DialogDescription>
            Editor enxuto do prompt especializado. Nome, avatar, papel e
            roteamento ficam na tela principal.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Resumo do prompt</Label>
            <Input
              value={draft.short_description || ""}
              onChange={(e) => setField("short_description", e.target.value)}
              placeholder="Resumo operacional deste especialista"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Contrato de atuação</Label>
            <Textarea
              value={draft.presentation || ""}
              onChange={(e) => setField("presentation", e.target.value)}
              className="min-h-28 resize-none text-sm"
              placeholder="Explique como este agente deve atuar quando for chamado."
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextListField
              label="Funções principais"
              value={lines(draft.functions)}
              onChange={(v) => setField("functions", splitLines(v))}
              placeholder={
                "Qualificar lead\nCriar campanha\nOrganizar relatório"
              }
            />
            <TextListField
              label="Limites"
              value={lines(draft.prohibitions)}
              onChange={(v) => setField("prohibitions", splitLines(v))}
              placeholder={
                "Não atender público final\nNão publicar sem aprovação"
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextListField
              label="Proteções"
              value={lines(draft.protections)}
              onChange={(v) => setField("protections", splitLines(v))}
              placeholder={"Pedir confirmação\nRegistrar pendências"}
            />
            <TextListField
              label="Exige aprovação"
              value={lines(draft.approval_required_for)}
              onChange={(v) => setField("approval_required_for", splitLines(v))}
              placeholder={"publicação externa\nalterar permissões"}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs">Skills deste agente</Label>
              {installedSkills.length > 0 && (
                <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                  {enabledSkillCount(draft)} ativas de {installedSkills.length}
                </span>
              )}
            </div>
            <SkillConfigEditor
              installedSkills={installedSkills}
              value={draft.skill_configs ?? []}
              onChange={(next) => setField("skill_configs", next)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Input
                value={draft.model || ""}
                onChange={(e) => setField("model", e.target.value)}
                placeholder="default"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ID do payload</Label>
              <Input
                value={draft.template_id || ""}
                onChange={(e) => setField("template_id", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="border-border/40 border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Cancelar
          </Button>
          <Button onClick={onApply} disabled={isApplying} className="gap-2">
            {isApplying ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconCheck className="size-4" />
            )}
            Aplicar no workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SkillConfigEditor({
  installedSkills,
  value,
  onChange,
}: {
  installedSkills: SkillSupportItem[]
  value: TemplateSkillConfig[]
  onChange: (next: TemplateSkillConfig[]) => void
}) {
  function getSkillConfig(name: string): TemplateSkillConfig | undefined {
    return value.find((config) => config.name === name)
  }

  function setSkillConfig(
    name: string,
    patch: Partial<Omit<TemplateSkillConfig, "name">>,
  ) {
    const existing = getSkillConfig(name)
    const merged: TemplateSkillConfig = {
      name,
      enabled: existing?.enabled ?? false,
      visible: existing?.visible ?? true,
      ...patch,
    }
    const next = existing
      ? value.map((config) => (config.name === name ? merged : config))
      : [...value, merged]
    onChange(next)
  }

  if (installedSkills.length === 0) {
    return (
      <div className="border-border/40 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-4 py-5 text-center text-sm">
        Nenhuma skill instalada neste workspace.
      </div>
    )
  }

  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {installedSkills.map((skill) => {
        const cfg = getSkillConfig(skill.name)
        const enabled = cfg?.enabled ?? false
        const visible = cfg?.visible ?? true
        const enabledID = `specialist-skill-enabled-${skill.name}`
        const visibleID = `specialist-skill-visible-${skill.name}`
        return (
          <li
            key={skill.name}
            className="border-border/50 bg-muted/10 rounded-lg border px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor={enabledID}
                  className="cursor-pointer text-sm font-medium"
                >
                  {skill.name}
                </Label>
                {skill.description ? (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                    {skill.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="flex flex-col items-end gap-1">
                  <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Ativa
                  </span>
                  <Switch
                    id={enabledID}
                    checked={enabled}
                    onCheckedChange={(checked) =>
                      setSkillConfig(skill.name, {
                        enabled: checked,
                        visible: cfg?.visible ?? true,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Visível
                  </span>
                  <Switch
                    id={visibleID}
                    checked={enabled && visible}
                    disabled={!enabled}
                    onCheckedChange={(checked) =>
                      setSkillConfig(skill.name, { visible: checked })
                    }
                  />
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─── config tab: agent detail view ────────────────────────────────────────────

export function AgentDetailView({
  agent,
  configData,
  resolvedPayload,
  template,
  isTogglingActive,
  isDeleting,
  onEdit,
  onOpenRawEditor,
  onToggleActive,
  onDelete,
  onOpenChat,
}: {
  agent: AgentSummary
  configData: AgentConfigResponse
  resolvedPayload: TemplateApplyPayload | null
  template: AgentTemplate | null
  isTogglingActive: boolean
  isDeleting: boolean
  onEdit: () => void
  onOpenRawEditor: () => void
  onToggleActive: () => void
  onDelete: () => void
  onOpenChat: () => void
}) {
  const { t } = useTranslation()
  const payload = configData.payload!
  const isActive = agent.active !== false
  const isDefault = agent.default
  const skillsActiveCount = enabledSkillCount(payload)
  const professionalsCount = payload.professionals?.length ?? 0
  const productsCount = payload.products?.length ?? 0
  const appliedAt = configData.applied_at
    ? new Date(configData.applied_at * 1000).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-6 duration-300">
      <div className="border-border/40 bg-card/60 relative overflow-hidden rounded-2xl border p-6 shadow-sm">
        <div className="from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <AgentAvatar agent={agent} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-xl font-semibold tracking-tight">
                {payload.name || agent.name || agent.id}
              </h2>
              {isDefault && <DefaultBadge />}
              <StatusBadge active={isActive} />
            </div>
            {(resolvedPayload?.presentation ?? payload.presentation) && (
              <p className="text-muted-foreground line-clamp-2 max-w-xl text-sm leading-relaxed">
                {resolvedPayload?.presentation ?? payload.presentation}
              </p>
            )}
            <p className="text-muted-foreground/70 font-mono text-xs">
              {agent.id}
            </p>
            <p className="text-muted-foreground text-xs">
              {agentRoleLabel(agent)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <Button onClick={onEdit} size="default" className="gap-2">
              <IconEdit className="size-4" />
              {promptEditLabel(agent)}
            </Button>
            <Button
              variant="outline"
              onClick={onOpenRawEditor}
              size="default"
              className="gap-2"
            >
              <IconBraces className="size-4" />
              {t("pages.agent.editor.raw_json", "JSON bruto")}
            </Button>
            {agent.id === "marketing" && (
              <Button
                variant="outline"
                onClick={onOpenChat}
                size="default"
                className="gap-2"
              >
                <IconSparkles className="size-4" />
                Testar Maya
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {agent.id === "marketing" && <MarketingPublishingPanel agent={agent} />}

        <section>
          <SectionHeader
            title={t("pages.agent.editor.section_identity", "Identidade")}
            icon={IconSparkles}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoCard
              label={t(
                "pages.agent.editor.summary.template",
                "Template aplicado",
              )}
              value={template?.name ?? payload.template_id}
            />
            <InfoCard
              label={t("pages.agent.editor.summary.tone", "Tom")}
              value={payload.tone}
            />
            <InfoCard
              label={t("pages.agent.editor.summary.language", "Idioma")}
              value={payload.language}
            />
            <InfoCard
              label={t("pages.agent.editor.summary.company", "Empresa")}
              value={payload.company_info?.name}
            />
          </div>
        </section>

        <Separator className="opacity-50" />

        <section>
          <SectionHeader
            title={t("pages.agent.editor.section_workspace", "Workspace")}
            icon={IconSettings}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoCard
              label={t("pages.agent.editor.summary.agent_id", "ID do agente")}
              value={agent.id}
              mono
            />
            <InfoCard
              label={t("pages.agent.editor.summary.workspace", "Workspace")}
              value={agent.workspace}
              mono
            />
            {appliedAt && (
              <InfoCard
                label={t(
                  "pages.agent.editor.summary.applied_at",
                  "Última aplicação",
                )}
                value={appliedAt}
              />
            )}
          </div>
        </section>

        <Separator className="opacity-50" />

        <section>
          <SectionHeader
            title={t("pages.agent.editor.section_capabilities", "Capacidades")}
            icon={IconUsers}
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <InfoCard
              label={t(
                "pages.agent.editor.summary.skills_active",
                "Skills ativas",
              )}
              value={`${skillsActiveCount}`}
            />
            <InfoCard
              label={t(
                "pages.agent.editor.summary.professionals",
                "Profissionais",
              )}
              value={
                payload.modules?.professionals_enabled
                  ? `${professionalsCount}`
                  : t("pages.agent.editor.summary.disabled", "desativado")
              }
            />
            <InfoCard
              label={t("pages.agent.editor.summary.products", "Produtos")}
              value={
                payload.modules?.products_enabled
                  ? `${productsCount}`
                  : t("pages.agent.editor.summary.disabled", "desativado")
              }
            />
          </div>
        </section>

        <Separator className="opacity-50" />

        <section>
          <SectionHeader
            title={t("pages.agent.editor.section_danger", "Zona de risco")}
            icon={IconAlertTriangle}
          />
          <p className="text-muted-foreground mt-1 mb-3 text-xs">
            {t(
              "pages.agent.editor.danger_description",
              "Estas ações afetam o comportamento do agente em todos os canais.",
            )}
          </p>
          <div className="border-destructive/20 bg-destructive/3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={isActive ? "outline" : "default"}
                size="sm"
                onClick={onToggleActive}
                disabled={isTogglingActive || (isDefault && isActive)}
                title={
                  isDefault && isActive
                    ? t(
                        "pages.agent.editor.default_agent_must_stay_active",
                        "O agente padrão precisa continuar ativo.",
                      )
                    : undefined
                }
                className={
                  isActive
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                    : ""
                }
              >
                {isTogglingActive ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : isActive ? (
                  <IconPlayerPause className="size-4" />
                ) : (
                  <IconPlayerPlay className="size-4" />
                )}
                {isActive
                  ? t("pages.agent.editor.deactivate_agent", "Desativar agente")
                  : t("pages.agent.editor.activate_agent", "Ativar agente")}
              </Button>
              {agent.id !== "main" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onDelete}
                      disabled={isDeleting}
                      className="border-red-500/20 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/20"
                    >
                      {isDeleting ? (
                        <IconLoader2 className="size-4 animate-spin" />
                      ) : (
                        <IconTrash className="size-4" />
                      )}
                      {t("pages.agent.editor.delete_agent", "Remover agente")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Os arquivos de workspace são preservados.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── profile & routing tab ────────────────────────────────────────────────────

export function ProfileTab({
  selectedAgentId,
  selectedProfile,
  selectedRoleConfigDraft,
  selectedRoleConfig,
  mainAgentID,
  mainAllowAgents,
  assistantJIDs,
  assistantChats,
  internalAgents,
  isSaving,
  isLoading,
  onUpdateProfile,
  onUpdateRoleConfig,
  onRoleConfigDraftChange,
  onMainAgentChange,
  onToggleMainAllow,
  onAssistantJIDsChange,
  onAssistantChatsChange,
  onSave,
  onRefresh,
}: {
  selectedAgentId: string
  selectedProfile?: AgentProfileDraft
  selectedRoleConfigDraft: string
  selectedRoleConfig: RoleConfigDraft | null
  mainAgentID: string
  mainAllowAgents: string[]
  assistantJIDs: string
  assistantChats: string
  internalAgents: AgentEditorAgent[]
  isSaving: boolean
  isLoading: boolean
  onUpdateProfile: (patch: Partial<AgentProfileDraft>) => void
  onUpdateRoleConfig: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
  onRoleConfigDraftChange: (v: string) => void
  onMainAgentChange: (id: string) => void
  onToggleMainAllow: (id: string) => void
  onAssistantJIDsChange: (v: string) => void
  onAssistantChatsChange: (v: string) => void
  onSave: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const mainAgent = internalAgents.find((a) => a.id === mainAgentID)
  const subagentOptions = internalAgents.filter((a) => a.id !== mainAgentID)

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-5 duration-300">
      {/* profile editor */}
      {selectedProfile && (
        <div className="border-border/40 bg-card/60 rounded-2xl border p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <ProfileAvatar profile={selectedProfile} />
            <div>
              <h3 className="text-sm font-semibold">
                {selectedProfile.name || selectedAgentId}
              </h3>
              <p className="text-muted-foreground text-xs">{selectedAgentId}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("pages.orchestration.agent_name", "Nome do agente")}
              </Label>
              <Input
                value={selectedProfile.name}
                onChange={(e) => onUpdateProfile({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("pages.orchestration.avatar_image", "Imagem")}
              </Label>
              <AvatarUpload
                value={selectedProfile.imageURL}
                onChange={(next) => onUpdateProfile({ imageURL: next })}
              />
            </div>
          </div>
        </div>
      )}

      {/* role config */}
      <div className="border-border/40 bg-card/60 rounded-2xl border p-5 shadow-sm">
        <SectionHeader
          title={t("pages.orchestration.role_config", "Perfil operacional")}
          icon={IconSparkles}
        />
        <p className="text-muted-foreground mt-1 mb-3 text-xs">
          {t(
            "pages.orchestration.role_config_hint",
            "Configuração estruturada do papel deste agente.",
          )}
        </p>
        {selectedRoleConfig && (
          <RoleSpecificConfigEditor
            config={selectedRoleConfig}
            onChange={onUpdateRoleConfig}
          />
        )}
        <Textarea
          value={selectedRoleConfigDraft}
          onChange={(e) => onRoleConfigDraftChange(e.target.value)}
          className="mt-3 min-h-48 font-mono text-xs"
          spellCheck={false}
        />
      </div>

      {/* routing */}
      <div className="border-border/40 bg-card/60 rounded-2xl border p-5 shadow-sm">
        <SectionHeader
          title={t("pages.orchestration.main_allowlist", "Roteamento")}
          icon={IconShield}
        />
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("pages.orchestration.main_agent", "Agente principal")}
            </Label>
            <Select
              value={mainAgentID}
              onValueChange={onMainAgentChange}
              disabled={isLoading || internalAgents.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("pages.orchestration.main_agent_placeholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {internalAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name || a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mainAgent && (
              <p className="text-muted-foreground font-mono text-xs">
                {mainAgent.id}
              </p>
            )}
          </div>

          {subagentOptions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Subagentes permitidos</Label>
              {subagentOptions.map((agent) => (
                <label
                  key={agent.id}
                  className="border-border/60 hover:bg-muted/40 flex min-h-10 cursor-pointer items-center justify-between rounded-lg border px-3 text-sm"
                >
                  <span className="font-medium">{agent.name || agent.id}</span>
                  <Switch
                    checked={mainAllowAgents.includes(agent.id)}
                    onCheckedChange={() => onToggleMainAllow(agent.id)}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {t(
                "pages.orchestration.assistant_jids",
                "Números autorizados da Sofia",
              )}
            </Label>
            <Textarea
              value={assistantJIDs}
              onChange={(e) => onAssistantJIDsChange(e.target.value)}
              placeholder={t("pages.orchestration.admin_jids_placeholder")}
              className="min-h-20 resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t(
                "pages.orchestration.assistant_chats",
                "Grupos autorizados da Sofia",
              )}
            </Label>
            <Textarea
              value={assistantChats}
              onChange={(e) => onAssistantChatsChange(e.target.value)}
              placeholder="group:120363000000000000@g.us"
              className="min-h-20 resize-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* save bar */}
      <div className="flex items-center gap-2 pb-4">
        <Button onClick={onSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconDeviceFloppy className="size-4" />
          )}
          {t("common.save", "Salvar")}
        </Button>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <IconRefresh className="size-4" />
          {t("common.refresh", "Atualizar")}
        </Button>
      </div>
    </div>
  )
}

// ─── chat tab ─────────────────────────────────────────────────────────────────

function ChatTab({
  selectedAgentId,
  selectedProfile,
  messages,
  chatInput,
  isSending,
  proposals,
  quickPrompts,
  onChatInputChange,
  onSend,
  onPromptSelect,
  onProposalInspect,
}: {
  selectedAgentId: string
  selectedProfile?: AgentProfileDraft
  messages: ChatMessage[]
  chatInput: string
  isSending: boolean
  proposals: unknown[]
  quickPrompts: Array<{
    icon: React.ElementType
    label: string
    prompt: string
  }>
  onChatInputChange: (v: string) => void
  onSend: () => void
  onPromptSelect: (v: string) => void
  onProposalInspect: (p: unknown) => void
}) {
  const { t } = useTranslation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isSending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [chatInput])

  const agentName = selectedProfile?.name || selectedAgentId
  const canSend = Boolean(chatInput.trim() && selectedAgentId && !isSending)

  const handleSend = () => {
    if (canSend) void onSend()
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex h-full flex-col gap-4 duration-300">
      <div
        className="border-border/60 bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm"
        style={{ minHeight: 560 }}
      >
        {/* chat header — avatar + nome + status online */}
        <div className="border-border/60 bg-background/40 flex items-center gap-3 border-b px-4 py-3">
          {selectedProfile && <ProfileAvatar profile={selectedProfile} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{agentName}</p>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                <span
                  className="size-1.5 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                Online
              </span>
            </div>
            <p className="text-muted-foreground truncate text-xs">
              Chat de teste · respostas não enviadas a usuários reais
            </p>
          </div>
        </div>

        {/* messages */}
        <div className="bg-muted/10 flex-1 overflow-y-auto px-4 py-5">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <IconMessageCircle className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Comece uma conversa de teste
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t(
                    "pages.orchestration.empty_chat",
                    "Selecione um agente interno e envie uma mensagem.",
                  )}
                </p>
              </div>
              {quickPrompts.length > 0 && (
                <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
                  {quickPrompts.slice(0, 4).map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => onPromptSelect(item.prompt)}
                        className="border-border/60 hover:border-primary/60 hover:bg-muted/60 focus-visible:ring-primary/30 group bg-background flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2"
                      >
                        <Icon
                          className="text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-xs leading-snug font-medium">
                          {item.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {messages.map((msg, i) => {
                const isUser = msg.role === "user"
                return (
                  <div
                    key={`${msg.role}-${i}`}
                    className={`flex ${isUser ? "justify-end" : "justify-start gap-2"}`}
                  >
                    {!isUser && selectedProfile && (
                      <div className="mt-auto">
                        <ProfileAvatar profile={selectedProfile} />
                      </div>
                    )}
                    <div
                      className={
                        isUser
                          ? "bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm"
                          : "bg-background border-border/60 max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
                      }
                    >
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              {isSending && (
                <div className="flex justify-start gap-2">
                  {selectedProfile && (
                    <div className="mt-auto">
                      <ProfileAvatar profile={selectedProfile} />
                    </div>
                  )}
                  <div className="bg-background border-border/60 flex items-center gap-1 rounded-2xl rounded-bl-sm border px-4 py-3 shadow-sm">
                    <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
                    <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
                    <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* quick prompts as inline chips (only when messages exist) */}
        {messages.length > 0 && quickPrompts.length > 0 && (
          <div className="border-border/60 bg-background/60 flex flex-wrap gap-1.5 border-t px-4 py-2">
            {quickPrompts.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onPromptSelect(item.prompt)}
                  className="border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border bg-transparent px-2.5 py-1 text-[11px] transition-colors"
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </div>
        )}

        {/* input */}
        <div className="border-border/60 bg-background border-t p-3">
          <div className="border-border/60 focus-within:border-primary/60 focus-within:ring-primary/20 bg-background flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors focus-within:ring-2">
            <Textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={`Mensagem para ${agentName}…`}
              rows={1}
              className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-sm shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-lg"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={t("pages.orchestration.send", "Enviar")}
            >
              {isSending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconSend className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            para enviar ·{" "}
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
              Shift
            </kbd>{" "}
            +{" "}
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            nova linha
          </p>
        </div>
      </div>

      {/* proposals */}
      {proposals.length > 0 && (
        <div className="border-border/40 bg-card/60 rounded-2xl border p-5 shadow-sm">
          <SectionHeader
            title={t("pages.orchestration.proposals", "Propostas")}
            icon={IconFileDescription}
          />
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {proposals.slice(0, 6).map((proposal, i) => (
              <ProposalCard
                key={i}
                proposal={proposal}
                onInspect={() => onProposalInspect(proposal)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── marketing panel (inside config tab) ─────────────────────────────────────

function MarketingPublishingPanel({ agent }: { agent: AgentSummary }) {
  const publishDir = marketingPublishDir(agent)
  const deliverables = agent.role_config?.marketing?.deliverables ?? [
    "catalog_html",
    "simple_site",
    "campaign",
  ]
  const platforms = agent.role_config?.marketing?.platforms ?? [
    "instagram",
    "site",
    "catalog_html",
  ]

  return (
    <section className="border-border/40 bg-card/60 rounded-2xl border p-5 shadow-sm">
      <SectionHeader title="Publicação da Maya" icon={IconWorldWww} />
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
        Catálogos, cardápios e sites simples salvos em{" "}
        <code className="bg-muted rounded px-1 font-mono text-xs">
          {publishDir}
        </code>{" "}
        ficam acessíveis em{" "}
        <code className="bg-muted rounded px-1 font-mono text-xs">
          /public/marketing/&lt;arquivo&gt;
        </code>
        .
      </p>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <InfoCard label="Pasta pública" value={publishDir} mono />
        <InfoCard label="URL base" value="/public/marketing/" mono />
        <InfoCard
          label="Aprovação"
          value={
            agent.role_config?.marketing?.requires_human_review === false
              ? "sem revisão obrigatória"
              : "revisão humana"
          }
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <CapabilityList
          icon={IconFileDescription}
          title="Entregáveis"
          items={deliverables}
        />
        <CapabilityList icon={IconPhoto} title="Canais" items={platforms} />
      </div>
    </section>
  )
}

function CapabilityList({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ElementType
  title: string
  items: string[]
}) {
  return (
    <div className="bg-muted/30 rounded-xl p-3">
      <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium uppercase">
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="rounded-full">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}

// ─── marketing role config editor (inside profile tab) ────────────────────────

function RoleSpecificConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  switch (String(config.kind || "")) {
    case "attendant":
      return <AttendantRoleConfigEditor config={config} onChange={onChange} />
    case "sales":
      return <SalesRoleConfigEditor config={config} onChange={onChange} />
    case "marketing":
      return <MarketingRoleConfigEditor config={config} onChange={onChange} />
    case "assistant":
      return <AssistantRoleConfigEditor config={config} onChange={onChange} />
    default:
      return null
  }
}

function AttendantRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const attendant = (config.attendant || {}) as AttendantRoleConfig
  const updateAttendant = (patch: Partial<AttendantRoleConfig>) => {
    onChange((c) => ({
      ...c,
      attendant: { ...((c.attendant || {}) as AttendantRoleConfig), ...patch },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 mb-3 space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Ana: atendimento e triagem</div>
          <div className="text-muted-foreground text-xs">
            Campos da porta pública: setores, dados mínimos e escalonamentos.
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          Agendamento
          <Switch
            checked={attendant.scheduling_enabled ?? false}
            onCheckedChange={(v) => updateAttendant({ scheduling_enabled: v })}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Setores"
          value={lines(attendant.departments)}
          placeholder={"vendas\nsuporte\nfinanceiro\nhumano"}
          onChange={(v) => updateAttendant({ departments: splitLines(v) })}
        />
        <TextListField
          label="Dados de triagem"
          value={lines(attendant.triage_fields)}
          placeholder={"nome\ncontato\nassunto\nurgencia"}
          onChange={(v) => updateAttendant({ triage_fields: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Regras de escalonamento"
          value={lines(attendant.escalation_rules)}
          placeholder={
            "reclamacao grave\ndesconto ou excecao\ninformacao nao confirmada"
          }
          onChange={(v) => updateAttendant({ escalation_rules: splitLines(v) })}
        />
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Fonte de FAQ
          </div>
          <Input
            value={attendant.faq_source || ""}
            onChange={(e) => updateAttendant({ faq_source: e.target.value })}
            placeholder="company_context"
          />
        </div>
      </div>
    </div>
  )
}

function SalesRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const sales = (config.sales || {}) as SalesRoleConfig
  const updateSales = (patch: Partial<SalesRoleConfig>) => {
    onChange((c) => ({
      ...c,
      sales: { ...((c.sales || {}) as SalesRoleConfig), ...patch },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 mb-3 space-y-4 rounded-xl border p-4">
      <div>
        <div className="text-sm font-medium">Leo: vendas e follow-up</div>
        <div className="text-muted-foreground text-xs">
          Campos usados para qualificar lead, classificar oportunidade e
          devolver próxima ação.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Etapas do funil"
          value={lines(sales.funnel_stages)}
          placeholder={
            "novo\nqualificacao\nproposta\nfollow_up\nganho\nperdido"
          }
          onChange={(v) => updateSales({ funnel_stages: splitLines(v) })}
        />
        <TextListField
          label="Campos de qualificação"
          value={lines(sales.qualification_fields)}
          placeholder={
            "problema\nfit\nautoridade\nprazo\norcamento\nproximo_passo"
          }
          onChange={(v) => updateSales({ qualification_fields: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Cadência de follow-up"
          value={lines(sales.followup_cadence)}
          placeholder={"D+1\nD+3\nD+7"}
          onChange={(v) => updateSales({ followup_cadence: splitLines(v) })}
        />
        <TextListField
          label="Regras de handoff"
          value={lines(sales.handoff_rules)}
          placeholder={
            "lead qualificado com prazo\npedido de contrato\nexcecao comercial"
          }
          onChange={(v) => updateSales({ handoff_rules: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            CRM / sistema
          </div>
          <Input
            value={sales.crm_integration || ""}
            onChange={(e) => updateSales({ crm_integration: e.target.value })}
            placeholder="future, planilha, CRM..."
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Fonte de preços
          </div>
          <Input
            value={sales.price_policy_source || ""}
            onChange={(e) =>
              updateSales({ price_policy_source: e.target.value })
            }
            placeholder="memory/pricing.md"
          />
        </div>
      </div>
    </div>
  )
}

function MarketingRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const marketing = (config.marketing || {}) as MarketingRoleConfig
  const cadence = marketing.cadence || {}
  const brandKit = marketing.brand_kit || {}

  const updateMarketing = (patch: Partial<MarketingRoleConfig>) => {
    onChange((c) => ({
      ...c,
      marketing: { ...((c.marketing || {}) as MarketingRoleConfig), ...patch },
    }))
  }
  const updateBrandKit = (
    patch: NonNullable<MarketingRoleConfig["brand_kit"]>,
  ) => {
    updateMarketing({ brand_kit: { ...brandKit, ...patch } })
  }
  const updateCadence = (
    patch: NonNullable<MarketingRoleConfig["cadence"]>,
  ) => {
    updateMarketing({ cadence: { ...cadence, ...patch } })
  }

  return (
    <div className="border-border/60 bg-muted/20 mb-3 space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Maya: sites e catálogos</div>
          <div className="text-muted-foreground text-xs">
            Campos para orientar campanhas, páginas e catálogos HTML.
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          Revisão humana
          <Switch
            checked={marketing.requires_human_review ?? true}
            onCheckedChange={(v) =>
              updateMarketing({ requires_human_review: v })
            }
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Pasta pública
          </div>
          <Input
            value={marketing.public_publish_dir || ""}
            onChange={(e) =>
              updateMarketing({ public_publish_dir: e.target.value })
            }
            placeholder="public/marketing"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Aprovação
          </div>
          <Select
            value={marketing.approval_mode || "owner_required"}
            onValueChange={(v) => updateMarketing({ approval_mode: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner_required">Dono aprova</SelectItem>
              <SelectItem value="admin_required">Admin aprova</SelectItem>
              <SelectItem value="draft_only">Apenas rascunho</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Plataformas"
          value={lines(marketing.platforms)}
          placeholder={"instagram\nsite\ncatalog_html"}
          onChange={(v) => updateMarketing({ platforms: splitLines(v) })}
        />
        <TextListField
          label="Entregáveis"
          value={lines(marketing.deliverables)}
          placeholder={"post\ncampaign\ncatalog_html\nsimple_site"}
          onChange={(v) => updateMarketing({ deliverables: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Pilares de conteúdo"
          value={lines(marketing.content_pillars)}
          placeholder={"educação\nprova social\npromoções"}
          onChange={(v) => updateMarketing({ content_pillars: splitLines(v) })}
        />
        <TextListField
          label="Fontes de tendência"
          value={lines(marketing.trend_sources)}
          placeholder={"instagram\ngoogle_trends\nconcorrentes"}
          onChange={(v) => updateMarketing({ trend_sources: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Cores da marca"
          value={lines(brandKit.colors)}
          placeholder={"#111827\n#f97316"}
          onChange={(v) => updateBrandKit({ colors: splitLines(v) })}
        />
        <TextListField
          label="Fontes da marca"
          value={lines(brandKit.fonts)}
          placeholder={"Inter\nMontserrat"}
          onChange={(v) => updateBrandKit({ fonts: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">Tom</div>
          <Input
            value={brandKit.tone || ""}
            onChange={(e) => updateBrandKit({ tone: e.target.value })}
            placeholder="claro, próximo e profissional"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Estilo visual
          </div>
          <Input
            value={brandKit.visual_style || ""}
            onChange={(e) => updateBrandKit({ visual_style: e.target.value })}
            placeholder="limpo, moderno, com fotos reais"
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Posts/semana
          </div>
          <Input
            type="number"
            min={0}
            value={cadence.posts_per_week ?? ""}
            onChange={(e) =>
              updateCadence({
                posts_per_week: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Campanhas/mês
          </div>
          <Input
            type="number"
            min={0}
            value={cadence.campaigns_per_month ?? ""}
            onChange={(e) =>
              updateCadence({
                campaigns_per_month: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Horizonte
          </div>
          <Input
            value={cadence.planning_horizon || ""}
            onChange={(e) =>
              updateCadence({ planning_horizon: e.target.value })
            }
            placeholder="1-4 semanas"
          />
        </div>
      </div>
    </div>
  )
}

function AssistantRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (c: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const assistant = (config.assistant || {}) as AssistantRoleConfig
  const updateAssistant = (patch: Partial<AssistantRoleConfig>) => {
    onChange((c) => ({
      ...c,
      assistant: { ...((c.assistant || {}) as AssistantRoleConfig), ...patch },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 mb-3 space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Sofia: assistente do dono</div>
          <div className="text-muted-foreground text-xs">
            Escopos privados, relatórios, delegação e confirmações obrigatórias.
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          Edita agentes
          <Switch
            checked={assistant.can_edit_agents ?? true}
            onCheckedChange={(v) => updateAssistant({ can_edit_agents: v })}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Escopos autorizados"
          value={lines(assistant.authorized_scopes)}
          placeholder={
            "workspace\nagents\nreports\ndocuments\nagenda\norchestration"
          }
          onChange={(v) =>
            updateAssistant({ authorized_scopes: splitLines(v) })
          }
        />
        <TextListField
          label="Relatórios"
          value={lines(assistant.report_cadence)}
          placeholder={"daily\nweekly\nmonthly"}
          onChange={(v) => updateAssistant({ report_cadence: splitLines(v) })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Pode chamar agentes"
          value={lines(assistant.can_call_agents)}
          placeholder={"main\nvendas\nmarketing"}
          onChange={(v) => updateAssistant({ can_call_agents: splitLines(v) })}
        />
        <TextListField
          label="Exige confirmação"
          value={lines(assistant.requires_confirmation)}
          placeholder={
            "editar agentes\nalterar permissoes\npublicar materiais\napagar arquivos"
          }
          onChange={(v) =>
            updateAssistant({ requires_confirmation: splitLines(v) })
          }
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-muted-foreground text-xs font-medium">
          Auditoria
        </div>
        <Select
          value={assistant.audit_level || "high"}
          onValueChange={(v) => updateAssistant({ audit_level: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function TextListField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  const tags = value
    ? value
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const suggestions = placeholder
    ? placeholder
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  const hint =
    tags.length === 0
      ? (placeholder?.split(/\r?\n/)[0] ?? undefined)
      : undefined
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <TagInput
        value={tags}
        onChange={(next) => onChange(next.join("\n"))}
        placeholder={hint ? `Ex.: ${hint}` : "Digite e pressione Enter"}
        ariaLabel={label}
        suggestions={suggestions}
      />
    </div>
  )
}

// ─── proposal card ────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  onInspect,
}: {
  proposal: unknown
  onInspect: () => void
}) {
  const kind = proposalKind(proposal)
  const assets = proposalAssets(proposal)
  const publicURLs = proposalPublicURLs(proposal)
  const Icon =
    kind === "site"
      ? IconWorldWww
      : kind === "catalog"
        ? IconFileDescription
        : IconSparkles

  return (
    <div className="bg-muted/30 ring-border/60 rounded-xl p-3 text-sm ring-1">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {proposalTitle(proposal)}
            </div>
            <div className="text-muted-foreground text-xs">
              {kind || "marketing"}
            </div>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onInspect}>
          Revisar
        </Button>
      </div>
      {assets.length > 0 ? (
        <div className="space-y-1">
          {assets.slice(0, 3).map((asset) => (
            <div
              key={asset}
              className="text-muted-foreground truncate font-mono text-xs"
              title={asset}
            >
              {asset}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          Sem arquivo vinculado.
        </div>
      )}
      {publicURLs.length > 0 && (
        <div className="border-border/60 mt-3 space-y-1 border-t pt-2">
          {publicURLs.slice(0, 3).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary block truncate text-xs hover:underline"
              title={url}
            >
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="border-border/40 rounded-2xl border p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-48 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ─── empty / unconfigured states ──────────────────────────────────────────────

function EmptyState({
  onCreate,
  canCreate,
}: {
  onCreate: () => void
  canCreate: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role="region"
      aria-label="Nenhum agente selecionado"
      className="border-border/40 bg-card/40 flex flex-col items-center gap-5 rounded-2xl border p-12 text-center"
    >
      <div
        aria-hidden="true"
        className="from-primary/15 to-primary/0 relative flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br"
      >
        <div className="bg-background flex size-16 items-center justify-center rounded-2xl shadow-sm">
          <IconUsers className="text-muted-foreground size-8" />
        </div>
        <span className="absolute -right-1 -bottom-1 inline-flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow">
          +
        </span>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-foreground text-lg font-semibold">
          {t(
            "pages.agent.editor.empty_title",
            "Selecione um agente ou crie um novo",
          )}
        </h3>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          {t(
            "pages.agent.editor.empty_description",
            "Escolha um agente na lista ao lado para editar identidade, papel, prompt e roteamento. Você também pode começar do zero com o wizard.",
          )}
        </p>
      </div>
      {canCreate ? (
        <Button onClick={onCreate} className="gap-2">
          <IconPlus className="size-4" aria-hidden="true" />
          {t("pages.agent.editor.new_agent", "Novo agente")}
        </Button>
      ) : (
        <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
          A criação de novos agentes está desativada pelo administrador.
        </p>
      )}
    </div>
  )
}

export function UnconfiguredState({
  agent,
  onCreate,
  onConfigure,
  onToggleActive,
  isTogglingActive = false,
  onDelete,
  isDeleting = false,
}: {
  agent?: AgentSummary
  onCreate: () => void
  onConfigure?: () => void
  onToggleActive?: () => void
  isTogglingActive?: boolean
  onDelete?: () => void
  isDeleting?: boolean
}) {
  const { t } = useTranslation()
  const isActive = agent?.active !== false

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-6 duration-300">
      {agent && (
        <div className="border-border/40 bg-card/60 relative overflow-hidden rounded-2xl border p-6 shadow-sm">
          <div className="from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
          <div className="relative flex items-start gap-4">
            <AgentAvatar agent={agent} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-2xl font-bold">
                  {agent.name || agent.id}
                </h2>
                {agent.default && <DefaultBadge />}
                <StatusBadge active={isActive} />
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {agent.id}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-200/60 bg-amber-50/50 p-10 text-center dark:border-amber-800/40 dark:bg-amber-950/20">
        <div className="flex size-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
          <IconAlertCircle className="size-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-foreground text-base font-semibold">
            {agent
              ? t("pages.agent.editor.empty_agent_title", "Agente sem template")
              : t("pages.agent.editor.empty_title")}
          </h3>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            {agent
              ? t(
                  "pages.agent.editor.empty_agent_description",
                  "Crie ou aplique um template para gerar o workspace do agente.",
                )
              : t("pages.agent.editor.empty_description")}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {agent && onConfigure && (
            <Button onClick={onConfigure} className="gap-2">
              <IconSparkles className="size-4" />
              {t("pages.agent.editor.configure_agent", "Configurar")}
            </Button>
          )}
          <Button
            variant={agent && onConfigure ? "outline" : "default"}
            onClick={onCreate}
            className="gap-2"
          >
            <IconPlus className="size-4" />
            {t("pages.agent.editor.new_agent", "Novo agente")}
          </Button>
        </div>
      </div>

      {agent && (onToggleActive || onDelete) && (
        <div className="border-destructive/20 bg-destructive/3 rounded-xl border p-4">
          <p className="text-muted-foreground mb-3 text-xs font-medium">
            {t("pages.agent.editor.section_danger", "Zona de risco")}
          </p>
          <div className="flex flex-wrap gap-2">
            {onToggleActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleActive}
                disabled={isTogglingActive || (agent.default && isActive)}
                className={
                  isActive
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                    : ""
                }
              >
                {isTogglingActive ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : isActive ? (
                  <IconPlayerPause className="size-4" />
                ) : (
                  <IconPlayerPlay className="size-4" />
                )}
                {isActive
                  ? t("pages.agent.editor.deactivate_agent", "Desativar agente")
                  : t("pages.agent.editor.activate_agent", "Ativar agente")}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className="border-red-500/20 text-red-700 hover:bg-red-500/10"
              >
                {isDeleting ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconTrash className="size-4" />
                )}
                {t("pages.agent.editor.delete_agent", "Remover agente")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
