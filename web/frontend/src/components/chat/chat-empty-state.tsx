import { IconRobotOff, IconSparkles, IconStar } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import type { AgentSummary } from "@/api/internal-agents"
import type { LauncherQuickTask } from "@/api/launcher-policy"
import type { UIVisibilityProfile } from "@/api/ui-visibility"
import { AIOrbAvatar, type AuraPalette } from "@/components/chat/ai-orb-avatar"
import { Button } from "@/components/ui/button"

const DISCONNECTED_GATEWAY_AURA: AuraPalette = [
  "#EF4444",
  "#FB7185",
  "#B91C1C",
  "#7F1D1D",
]

const AGENT_INTRO_BY_KEY: Record<string, string> = {
  rafael: "Cuido dos bastidores e chamo a pessoa certa.",
  main: "Cuido dos bastidores e chamo a pessoa certa.",
  assistente: "Cuido dos bastidores e chamo a pessoa certa.",
  clara: "Recebo clientes e encaminho o que precisar.",
  atendente: "Recebo clientes e encaminho o que precisar.",
  luna: "Atendo fora do horário e deixo tudo organizado.",
  marcos: "Ajudo a vender e acompanhar oportunidades.",
  vendas: "Ajudo a vender e acompanhar oportunidades.",
  camila: "Cuido do suporte e do pós-venda.",
  suporte: "Cuido do suporte e do pós-venda.",
  lia: "Crio campanhas e materiais de marketing.",
  marketing: "Crio campanhas e materiais de marketing.",
  sofia: "Entendo seu negócio e desenho seu time de atendimento de IA.",
  onboarding: "Entendo seu negócio e desenho seu time de atendimento de IA.",
  catarina: "Organizo o conhecimento da empresa.",
  operador: "Cuido dos ajustes técnicos.",
  humano: "Chamo uma pessoa quando precisa.",
}

// Sofia is the discovery agent that owns the entire public-tenant chat
// surface (see docs/architecture/public-tenant-promotion.md). The provisioner
// already swaps workspace/AGENT.md to Sofia mode for IsPublic tenants (see
// internal/saas/tenant/workspace.go::ApplyPublicSofiaAgentMD), but the
// frontend empty state separately reads agent.name/id from the agents API,
// which still surfaces "Rafael" (front-line of the cliente team). Forcing
// Sofia branding in the public-tenant empty state keeps the visible voice
// consistent with the actual LLM persona that responds.
const PUBLIC_TENANT_FORCED_NAME = "Sofia"
const PUBLIC_TENANT_FORCED_INTRO = AGENT_INTRO_BY_KEY.sofia
const PUBLIC_TENANT_START_PROMPT =
  "Quero começar. Pode conduzir o discovery do meu negócio do jeito mais simples, com uma pergunta por vez."

interface ChatEmptyStateProps {
  hasAvailableModels: boolean
  defaultModelName: string
  isConnected: boolean
  agent?: AgentSummary | null
  chatIntro?: string
  displayName?: string
  displayDescription?: string
  avatarSeed?: string
  avatarColors?: AuraPalette
  quickTasks?: LauncherQuickTask[]
  disabled?: boolean
  onQuickTask?: (prompt: string) => void
  // activeProfile drives public-tenant overrides: when "public", agent
  // name + intro are forced to Sofia regardless of what `agent` reports.
  activeProfile?: UIVisibilityProfile | null
  hasContinuableSession?: boolean
}

function normalizeAgentLookup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function roleConfigText(
  agent: AgentSummary | null | undefined,
  key: string,
): string {
  const value = agent?.role_config?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function agentSpecificIntro(agent: AgentSummary | null | undefined): string {
  const candidates = [
    agent?.id,
    agent?.name,
    roleConfigText(agent, "kind"),
    roleConfigText(agent, "role"),
  ].filter((value): value is string => Boolean(value?.trim()))

  for (const candidate of candidates) {
    const normalized = normalizeAgentLookup(candidate)
    const direct = AGENT_INTRO_BY_KEY[normalized]
    if (direct) return direct

    const partial = Object.entries(AGENT_INTRO_BY_KEY).find(([key]) =>
      normalized.includes(key),
    )
    if (partial) return partial[1]
  }

  return ""
}

function agentIntro(agent: AgentSummary | null | undefined, t: TFunction) {
  const name = (agent?.name || agent?.id || "").trim()
  const kind = roleConfigText(agent, "kind")

  const specificDescription = agentSpecificIntro(agent)
  if (specificDescription) return specificDescription

  const configuredShortDescription = roleConfigText(agent, "short_description")
  if (configuredShortDescription) return configuredShortDescription

  if (kind) {
    const translated = t(`chat.agentIntro.${kind}`, {
      defaultValue: "",
      name,
    })
    if (translated.trim()) {
      return translated
    }
  }

  return roleConfigText(agent, "description")
}

export function ChatEmptyState({
  hasAvailableModels,
  defaultModelName,
  isConnected,
  agent,
  chatIntro,
  displayName,
  displayDescription,
  avatarSeed,
  avatarColors,
  quickTasks,
  disabled,
  onQuickTask,
  activeProfile,
  hasContinuableSession = false,
}: ChatEmptyStateProps) {
  const { t } = useTranslation()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-80">
        <div
          className="mb-6 size-20 overflow-hidden rounded-full shadow-sm ring-1 ring-red-200/20"
          aria-hidden="true"
        >
          <AIOrbAvatar
            seed="gateway-disconnected"
            colors={DISCONNECTED_GATEWAY_AURA}
            ringClassName="ring-red-200/35"
            tone="red"
          />
        </div>
        <h3 className="mb-2 text-xl font-medium">
          {t("chat.empty.notRunning")}
        </h3>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          {t("chat.empty.notRunningDescription")}
        </p>
      </div>
    )
  }

  if (!hasAvailableModels) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <IconRobotOff className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-medium">
          {t("chat.empty.noConfiguredModel")}
        </h3>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          {t("chat.empty.noConfiguredModelDescription")}
        </p>
        <Button asChild variant="outline" size="sm" className="px-4">
          <Link to="/models">{t("chat.empty.goToModels")}</Link>
        </Button>
      </div>
    )
  }

  if (!defaultModelName) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <IconStar className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-medium">
          {t("chat.empty.noSelectedModel")}
        </h3>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          {t("chat.empty.noSelectedModelDescription")}
        </p>
      </div>
    )
  }

  const isPublicTenant = activeProfile === "public"
  // Public tenants: ignore whatever the agent registry reports (typically
  // Rafael as the first agents.list entry) and brand the empty state as
  // Sofia, who is the actual LLM persona doing discovery.
  const agentName = isPublicTenant
    ? PUBLIC_TENANT_FORCED_NAME
    : (displayName || agent?.name || agent?.id || "").trim()
  const heading = agentName
    ? t("chat.welcomeWithAgent", { name: agentName })
    : t("chat.welcome")
  const agentDescription = isPublicTenant
    ? PUBLIC_TENANT_FORCED_INTRO
    : displayDescription?.trim() || agentIntro(agent, t)
  const description = (agentDescription ||
    (chatIntro && chatIntro.length > 0
      ? chatIntro
      : t("chat.welcomeDesc"))) as string
  const tasks = (quickTasks ?? []).filter(
    (task) => task.label.trim() && task.prompt.trim(),
  )

  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#f4f3ef]">
      <div
        className="mb-7 size-28 overflow-hidden rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-white/10"
        aria-hidden="true"
      >
        {agent?.avatar?.image_url ? (
          <img
            src={agent.avatar.image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <AIOrbAvatar
            seed={avatarSeed || agentName || agent?.id || "chat"}
            colors={avatarColors}
          />
        )}
      </div>
      <h3 className="mb-2 text-center text-2xl font-medium tracking-tight">
        {heading}
      </h3>
      <p className="mb-7 max-w-xl text-center text-sm leading-6 text-[#b8b5ac]">
        {description}
      </p>

      {isPublicTenant && onQuickTask ? (
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onQuickTask(PUBLIC_TENANT_START_PROMPT)}
          className="mb-7 h-10 rounded-full bg-[#f4f3ef] px-5 text-sm font-medium text-[#242421] shadow-[0_8px_24px_rgba(0,0,0,0.2)] hover:bg-white disabled:opacity-60"
        >
          <IconSparkles className="size-4" />
          {t(
            hasContinuableSession
              ? "chat.empty.continuePublicDiscovery"
              : "chat.empty.startPublicDiscovery",
          )}
        </Button>
      ) : null}

      {tasks.length > 0 && (
        <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
          {tasks.map((task, index) => (
            <Button
              key={`${task.label}-${index}`}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onQuickTask?.(task.prompt)}
              className="h-auto justify-start gap-2 rounded-2xl border-white/10 bg-white/[0.035] px-3 py-2.5 text-left text-sm whitespace-normal text-[#eeeae0] hover:bg-white/[0.07]"
            >
              <IconSparkles className="mt-0.5 size-4 shrink-0 text-[#d6b48a]" />
              <span className="flex-1 leading-snug">{task.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
