import {
  IconPlugConnectedX,
  IconRobot,
  IconRobotOff,
  IconSparkles,
  IconStar,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import type { AgentSummary } from "@/api/internal-agents"
import type { LauncherQuickTask } from "@/api/launcher-policy"
import { Button } from "@/components/ui/button"

interface ChatEmptyStateProps {
  hasAvailableModels: boolean
  defaultModelName: string
  isConnected: boolean
  agent?: AgentSummary | null
  chatIntro?: string
  quickTasks?: LauncherQuickTask[]
  disabled?: boolean
  onQuickTask?: (prompt: string) => void
}

export function ChatEmptyState({
  hasAvailableModels,
  defaultModelName,
  isConnected,
  agent,
  chatIntro,
  quickTasks,
  disabled,
  onQuickTask,
}: ChatEmptyStateProps) {
  const { t } = useTranslation()

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

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <IconPlugConnectedX className="h-8 w-8" />
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

  const agentName = (agent?.name || agent?.id || "").trim()
  const initials =
    agent?.avatar?.initials ||
    (agentName ? agentName.slice(0, 2).toUpperCase() : "")
  const heading = agentName ? t("chat.welcomeWithAgent", { name: agentName }) : t("chat.welcome")
  const description = (chatIntro && chatIntro.length > 0
    ? chatIntro
    : t("chat.welcomeDesc")) as string
  const tasks = (quickTasks ?? []).filter(
    (task) => task.label.trim() && task.prompt.trim(),
  )

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div
        className="ring-border/40 mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold shadow-sm ring-1"
        style={{
          backgroundColor: agent?.avatar?.background || "#ede9fe",
          color: agent?.avatar?.foreground || "#7c3aed",
        }}
        aria-hidden="true"
      >
        {agent?.avatar?.image_url ? (
          <img
            src={agent.avatar.image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <IconRobot className="h-9 w-9" />
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
