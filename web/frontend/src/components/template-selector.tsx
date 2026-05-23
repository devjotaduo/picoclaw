/**
 * TemplateSelector
 *
 * Dropdown que permite ao operador alternar a "persona" da UI em runtime:
 * admin (operador), tenant (cliente logado) ou public (visitante anônimo).
 * O valor escolhido é gravado em localStorage via
 * `setUIVisibilityProfileOverride` e o hook `useUIVisibility` reage à
 * mudança automaticamente — sem reload da página.
 *
 * Útil para:
 *  - Preview de como a UI aparece para cada tipo de usuário.
 *  - Validar visibility flags do `mock-api/ui-visibility.json`.
 *  - Demo de SaaS para diferentes tiers de tenant.
 *
 * Quando nenhum override está ativo, a resolução automática (launcher
 * policy + role + active_profile do JSON) volta a vigorar.
 */

import { useCallback } from "react"

import type { UIVisibilityProfile } from "@/api/ui-visibility"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUIVisibility } from "@/hooks/use-ui-visibility"

const PROFILE_OPTIONS: ReadonlyArray<{
  value: UIVisibilityProfile
  label: string
  description: string
}> = [
  {
    value: "admin",
    label: "Admin",
    description: "Operador interno — vê tudo",
  },
  {
    value: "tenant",
    label: "Tenant",
    description: "Cliente logado no launcher",
  },
  {
    value: "public",
    label: "Público",
    description: "Visitante anônimo — visão mínima",
  },
] as const

const AUTO_SENTINEL = "__auto__"

export interface TemplateSelectorProps {
  /** Compact mode renders only the dropdown without surrounding label. */
  compact?: boolean
  /** Optional className forwarded to the trigger for layout tweaks. */
  className?: string
}

export function TemplateSelector({ compact, className }: TemplateSelectorProps) {
  const { profile, override, setProfileOverride } = useUIVisibility()

  const handleChange = useCallback(
    (value: string) => {
      if (value === AUTO_SENTINEL) {
        setProfileOverride(null)
        return
      }
      if (value === "admin" || value === "tenant" || value === "public") {
        setProfileOverride(value)
      }
    },
    [setProfileOverride],
  )

  // Show the currently effective profile in the trigger when no explicit
  // override is set, so the operator can see what the resolver picked.
  const currentValue = override ?? AUTO_SENTINEL

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      }
      data-testid="template-selector"
    >
      {!compact && (
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Template
        </span>
      )}
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger
          className={className ?? (compact ? "h-8 w-[140px]" : "w-[180px]")}
          aria-label="Selecionar template de visibilidade"
        >
          <SelectValue placeholder={profile} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_SENTINEL}>
            <div className="flex flex-col">
              <span className="text-sm">Auto ({profile})</span>
              <span className="text-xs text-zinc-500">
                Resolução pelo launcher
              </span>
            </div>
          </SelectItem>
          {PROFILE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col">
                <span className="text-sm">{option.label}</span>
                <span className="text-xs text-zinc-500">
                  {option.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
