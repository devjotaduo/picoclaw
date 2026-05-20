import {
  IconAlertCircle,
  IconCheck,
  IconDeviceFloppy,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SaveState } from "@/store/agent-editor"

export interface SaveBarProps {
  saveState: SaveState
  lastSavedAt: number | null
  errorMessage?: string | null
  onSave: () => void
  onDiscard?: () => void
  disabled?: boolean
  saveLabel?: string
}

function formatRelative(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 5) return "agora há pouco"
  if (seconds < 60) return `há ${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.round(hours / 24)
  return `há ${days}d`
}

function StateBadge({
  saveState,
  lastSavedAt,
  errorMessage,
}: Pick<SaveBarProps, "saveState" | "lastSavedAt" | "errorMessage">) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (saveState !== "saved" || !lastSavedAt) return
    const interval = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(interval)
  }, [saveState, lastSavedAt])

  switch (saveState) {
    case "saving":
      return (
        <span
          role="status"
          aria-live="polite"
          className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
        >
          <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Salvando…
        </span>
      )
    case "saved":
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"
        >
          <IconCheck className="size-3.5" aria-hidden="true" />
          Salvo {lastSavedAt ? `· ${formatRelative(lastSavedAt)}` : ""}
        </span>
      )
    case "error":
      return (
        <span
          role="alert"
          aria-live="assertive"
          className="text-destructive inline-flex items-center gap-1.5 text-xs"
        >
          <IconAlertCircle className="size-3.5" aria-hidden="true" />
          {errorMessage ?? "Erro ao salvar"}
        </span>
      )
    case "dirty":
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
        >
          <IconAlertCircle className="size-3.5" aria-hidden="true" />
          Alterações não salvas
        </span>
      )
    default:
      return (
        <span className="text-muted-foreground text-xs">Sem alterações</span>
      )
  }
}

export function SaveBar({
  saveState,
  lastSavedAt,
  errorMessage,
  onSave,
  onDiscard,
  disabled,
  saveLabel = "Salvar",
}: SaveBarProps) {
  const isSaving = saveState === "saving"
  const canSave = saveState === "dirty" || saveState === "error"
  return (
    <div
      role="region"
      aria-label="Barra de salvamento"
      className={cn(
        "border-border/60 bg-background flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3",
      )}
    >
      <StateBadge
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        errorMessage={errorMessage}
      />
      <div className="flex items-center gap-2">
        {onDiscard && canSave && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={disabled || isSaving}
            className="gap-1.5"
          >
            <IconRefresh className="size-4" aria-hidden="true" />
            Descartar
          </Button>
        )}
        <Button
          type="button"
          onClick={onSave}
          disabled={disabled || !canSave || isSaving}
          className="gap-1.5"
          aria-keyshortcuts="Control+S"
        >
          {isSaving ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <IconDeviceFloppy className="size-4" aria-hidden="true" />
          )}
          {saveLabel}
          <kbd className="bg-primary-foreground/10 hidden rounded px-1 text-[10px] sm:inline">
            Ctrl+S
          </kbd>
        </Button>
      </div>
    </div>
  )
}
