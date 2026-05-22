import { IconRobotOff, IconSparkles, IconStar } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import type { AgentSummary } from "@/api/internal-agents"
import type { LauncherQuickTask } from "@/api/launcher-policy"
import { AIOrbAvatar, type AuraPalette } from "@/components/chat/ai-orb-avatar"
import { Button } from "@/components/ui/button"

const DISCONNECTED_GATEWAY_AURA: AuraPalette = [
  "#EF4444",
  "#FB7185",
  "#B91C1C",
  "#7F1D1D",
]

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
}

function agentIntro(agent: AgentSummary | null | undefined, t: TFunction) {
  const name = (agent?.name || agent?.id || "").trim()
  const kind =
    typeof agent?.role_config?.kind === "string"
      ? agent.role_config.kind.trim()
      : ""

  if (kind) {
    const translated = t(`chat.agentIntro.${kind}`, {
      defaultValue: "",
      name,
    })
    if (translated.trim()) {
      return translated
    }
  }

  const description =
    typeof agent?.role_config?.description === "string"
      ? agent.role_config.description.trim()
      : ""
  return description || ""
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

  const agentName = (displayName || agent?.name || agent?.id || "").trim()
  const heading = agentName
    ? t("chat.welcomeWithAgent", { name: agentName })
    : t("chat.welcome")
  const agentDescription = displayDescription?.trim() || agentIntro(agent, t)
  const description = (agentDescription ||
    (chatIntro && chatIntro.length > 0
      ? chatIntro
      : t("chat.welcomeDesc"))) as string
  const tasks = (quickTasks ?? []).filter(
    (task) => task.label.trim() && task.prompt.trim(),
  )

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div
        className="ring-border/40 mb-6 size-20 overflow-hidden rounded-full shadow-sm ring-1"
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
      <h3 className="mb-2 text-center text-xl font-medium">{heading}</h3>
      <p className="text-muted-foreground mb-6 max-w-xl text-center text-sm">
        {description}
      </p>

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
              className="h-auto justify-start gap-2 px-3 py-2 text-left text-sm whitespace-normal"
            >
              <IconSparkles className="text-primary mt-0.5 size-4 shrink-0" />
              <span className="flex-1 leading-snug">{task.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
