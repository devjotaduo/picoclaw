import {
  IconAlertTriangle,
  IconCheck,
  IconCircleDashed,
  IconRosetteDiscountCheck,
} from "@tabler/icons-react"
import type { ComponentType, SVGProps } from "react"

import { cn } from "@/lib/utils"

import type { StepID, StepValidation } from "./schemas"

export interface ProgressChecklistProps {
  steps: StepValidation[]
  activeTab?: string
  onStepClick?: (id: StepID) => void
}

const STEP_LABELS: Record<StepID, string> = {
  identity: "Identidade",
  role: "Papel",
  prompt: "Prompt",
  knowledge: "Conhecimento",
  routing: "Roteamento",
}

const STATUS_ICONS: Record<
  StepValidation["status"],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  complete: IconCheck,
  partial: IconAlertTriangle,
  empty: IconCircleDashed,
  error: IconAlertTriangle,
}

const STATUS_CLASSES: Record<StepValidation["status"], string> = {
  complete:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  partial:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  empty: "bg-muted text-muted-foreground",
  error: "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
}

const STATUS_LABEL: Record<StepValidation["status"], string> = {
  complete: "concluído",
  partial: "parcial",
  empty: "vazio",
  error: "com erro",
}

export function ProgressChecklist({
  steps,
  activeTab,
  onStepClick,
}: ProgressChecklistProps) {
  const completed = steps.filter((s) => s.status === "complete").length
  const ready = steps.every(
    (s) => s.status === "complete" || s.status === "partial",
  )
  const percent = Math.round((completed / steps.length) * 100)

  return (
    <section
      aria-label="Progresso da configuração do agente"
      className="border-border/40 bg-card/60 rounded-2xl border p-4 shadow-sm"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Configuração do agente</h2>
          <p className="text-muted-foreground text-xs">
            {completed} de {steps.length} etapas concluídas · {percent}%
          </p>
        </div>
        <div
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            ready
              ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          <IconRosetteDiscountCheck className="size-3.5" aria-hidden="true" />
          {ready ? "Pronto para ativar" : "Faltam etapas"}
        </div>
      </header>

      <ol
        role="list"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {steps.map((step, index) => {
          const Icon = STATUS_ICONS[step.status]
          const isActive = activeTab === step.id
          const label = STEP_LABELS[step.id]
          const accessibleStatus = STATUS_LABEL[step.status]
          const id = `step-${step.id}`
          return (
            <li key={step.id}>
              <button
                type="button"
                id={id}
                onClick={() => onStepClick?.(step.id)}
                aria-current={isActive ? "step" : undefined}
                aria-describedby={`${id}-desc`}
                className={cn(
                  "border-border/40 hover:bg-muted/40 focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  isActive && "border-primary bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                    STATUS_CLASSES[step.status],
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                    {index + 1}
                  </span>
                  <span className="block truncate text-xs font-medium">
                    {label}
                  </span>
                </span>
                <span id={`${id}-desc`} className="sr-only">
                  {label} {accessibleStatus}
                  {step.missing.length > 0 && `: ${step.missing.join(", ")}`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
