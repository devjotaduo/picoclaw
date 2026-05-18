import {
  IconBriefcase,
  IconBuildingStore,
  IconCalendarStats,
  IconChartBar,
  IconCircleCheck,
  IconClipboardCheck,
  IconHeadset,
  IconHome,
  IconMessage2,
  IconPhone,
  IconRobot,
  IconShoppingCart,
  IconSparkles,
  IconStethoscope,
  IconTargetArrow,
  IconTools,
  IconUserShield,
  IconUsers,
  IconWorldWww,
} from "@tabler/icons-react"
import type { ComponentType, ReactNode, SVGProps } from "react"
import { useId, useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface IconOption {
  id: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const ICON_LIBRARY: IconOption[] = [
  { id: "headset", label: "Atendimento", Icon: IconHeadset },
  { id: "target", label: "Vendas", Icon: IconTargetArrow },
  { id: "sparkles", label: "Marketing", Icon: IconSparkles },
  { id: "assistant", label: "Assistente", Icon: IconUserShield },
  { id: "robot", label: "Robô", Icon: IconRobot },
  { id: "world", label: "Site", Icon: IconWorldWww },
  { id: "store", label: "Loja", Icon: IconBuildingStore },
  { id: "cart", label: "Carrinho", Icon: IconShoppingCart },
  { id: "clinic", label: "Clínica", Icon: IconStethoscope },
  { id: "schedule", label: "Agenda", Icon: IconCalendarStats },
  { id: "report", label: "Relatório", Icon: IconChartBar },
  { id: "checklist", label: "Checklist", Icon: IconClipboardCheck },
  { id: "support", label: "Suporte", Icon: IconTools },
  { id: "message", label: "Mensagem", Icon: IconMessage2 },
  { id: "phone", label: "Telefone", Icon: IconPhone },
  { id: "users", label: "Time", Icon: IconUsers },
  { id: "business", label: "Negócios", Icon: IconBriefcase },
  { id: "home", label: "Casa", Icon: IconHome },
  { id: "verified", label: "Aprovado", Icon: IconCircleCheck },
]

export function iconComponentFor(id: string) {
  return ICON_LIBRARY.find((i) => i.id === id)?.Icon ?? null
}

export function renderIcon(
  id: string,
  props?: SVGProps<SVGSVGElement>,
): ReactNode {
  const opt = ICON_LIBRARY.find((i) => i.id === id)
  if (!opt) return null
  const Icon = opt.Icon
  return <Icon {...props} />
}

export interface IconPickerProps {
  id?: string
  label: string
  value: string
  onChange: (id: string) => void
  background?: string
  foreground?: string
}

export function IconPicker({
  id,
  label,
  value,
  onChange,
  background,
  foreground,
}: IconPickerProps) {
  const autoId = useId()
  const inputId = id ?? `icon-${autoId}`
  const [query, setQuery] = useState("")
  const selectedNode = renderIcon(value, { className: "size-5" })
  const visible = ICON_LIBRARY.filter((opt) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      opt.label.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-2">
      <div
        id={`${inputId}-label`}
        className="text-foreground text-xs font-medium"
      >
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="border-border/60 inline-flex size-9 shrink-0 items-center justify-center rounded-md border"
          style={{
            backgroundColor: background ?? "transparent",
            color: foreground,
          }}
          aria-hidden="true"
        >
          {selectedNode ?? "—"}
        </span>
        <Input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ícone…"
          aria-labelledby={`${inputId}-label`}
          className="text-xs"
        />
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${inputId}-label`}
        className="border-border/60 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto rounded-md border p-1.5 sm:grid-cols-8 md:grid-cols-10"
      >
        {visible.length === 0 ? (
          <div className="text-muted-foreground col-span-full p-3 text-center text-xs">
            Nenhum ícone encontrado.
          </div>
        ) : (
          visible.map(({ id: optID, label: optLabel, Icon }) => {
            const active = optID === value
            return (
              <button
                key={optID}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(optID)}
                title={optLabel}
                className={cn(
                  "border-border/40 hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-8 items-center justify-center rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  active && "border-primary bg-primary/10",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="sr-only">{optLabel}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
