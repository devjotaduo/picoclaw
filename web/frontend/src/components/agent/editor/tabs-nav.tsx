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
  complete: "text-muted-foreground",
  partial: "text-muted-foreground",
  empty: "text-muted-foreground",
  error: "text-destructive",
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
      className="bg-card border-border/60 flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border p-1"
    >
      {TABS_ORDER.map((id) => {
        const label = TAB_LABELS[id]
        if (id === "test") {
          return (
            <TabsTrigger
              key={id}
              value={id}
              className="h-8 gap-1.5 rounded-md px-3 text-xs"
            >
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
          <TabsTrigger
            key={id}
            value={id}
            className="h-8 gap-1.5 rounded-md px-3 text-xs"
          >
            <Icon className={cn("size-3.5", iconClass)} aria-hidden="true" />
            {label}
            <span className="sr-only">{statusText}</span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
