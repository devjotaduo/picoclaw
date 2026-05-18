import {
  IconAlertTriangle,
  IconCheck,
  IconCircleDashed,
  IconMessageCircle,
} from "@tabler/icons-react"
import type { ComponentType, SVGProps } from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import type { StepID, StepValidation } from "./schemas"

export type AgentEditorTab = StepID | "test"

const TAB_LABELS: Record<AgentEditorTab, string> = {
  identity: "Identidade",
  role: "Papel",
  prompt: "Prompt",
  knowledge: "Conhecimento",
  routing: "Roteamento",
  test: "Teste",
}

const STATUS_ICON: Record<
  StepValidation["status"],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  complete: IconCheck,
  partial: IconAlertTriangle,
  empty: IconCircleDashed,
  error: IconAlertTriangle,
}

const STATUS_CLASS: Record<StepValidation["status"], string> = {
  complete: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  empty: "text-muted-foreground",
  error: "text-red-600 dark:text-red-400",
}

export const TABS_ORDER: AgentEditorTab[] = [
  "identity",
  "role",
  "prompt",
  "knowledge",
  "routing",
  "test",
]

export function isValidTab(value: string): value is AgentEditorTab {
  return (TABS_ORDER as string[]).includes(value)
}

export interface TabsNavProps {
  steps: StepValidation[]
}

export function TabsNav({ steps }: TabsNavProps) {
  const stepByID = new Map(steps.map((s) => [s.id, s] as const))
  return (
    <TabsList
      role="tablist"
      aria-label="Seções do editor de agente"
      className="flex h-auto w-full flex-wrap gap-1 p-1"
    >
      {TABS_ORDER.map((id) => {
        const label = TAB_LABELS[id]
        if (id === "test") {
          return (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <IconMessageCircle className="size-3.5" aria-hidden="true" />
              {label}
            </TabsTrigger>
          )
        }
        const step = stepByID.get(id)
        const Icon = step ? STATUS_ICON[step.status] : IconCircleDashed
        const iconClass = step ? STATUS_CLASS[step.status] : STATUS_CLASS.empty
        const statusText = step
          ? step.status === "complete"
            ? "concluído"
            : step.status === "partial"
              ? "parcial"
              : step.status === "error"
                ? "com erro"
                : "vazio"
          : "vazio"
        return (
          <TabsTrigger key={id} value={id} className="gap-1.5">
            <Icon
              className={cn("size-3.5", iconClass)}
              aria-hidden="true"
            />
            {label}
            <span className="sr-only">{statusText}</span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
