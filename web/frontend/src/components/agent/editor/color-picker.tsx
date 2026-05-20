import { useId } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { contrastInfo } from "./contrast"

export const DEFAULT_BG_PRESETS: string[] = [
  "#2563eb",
  "#16a34a",
  "#f43f5e",
  "#7c3aed",
  "#0ea5e9",
  "#f59e0b",
  "#dc2626",
  "#475569",
  "#0f172a",
  "#10b981",
]

export const DEFAULT_FG_PRESETS: string[] = ["#ffffff", "#0f172a", "#f8fafc"]

export interface ColorPickerProps {
  id?: string
  label: string
  value: string
  onChange: (hex: string) => void
  presets?: string[]
  contrastAgainst?: string
  ariaDescription?: string
}

const HEX_RE = /^#?[0-9a-fA-F]{0,6}$/

export function ColorPicker({
  id,
  label,
  value,
  onChange,
  presets = DEFAULT_BG_PRESETS,
  contrastAgainst,
  ariaDescription,
}: ColorPickerProps) {
  const autoId = useId()
  const inputId = id ?? `color-${autoId}`
  const hex = normalizeHex(value)
  const contrast = contrastAgainst ? contrastInfo(value, contrastAgainst) : null
  const swatch = hex || "#000000"
  return (
    <div className="space-y-2">
      <div
        id={`${inputId}-label`}
        className="text-foreground text-xs font-medium"
      >
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-labelledby={`${inputId}-label`}
          className="border-border/60 size-9 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          id={inputId}
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (HEX_RE.test(v)) onChange(v.startsWith("#") ? v : `#${v}`)
          }}
          aria-describedby={ariaDescription ? `${inputId}-desc` : undefined}
          placeholder="#0F172A"
          className="font-mono text-xs"
          maxLength={7}
        />
      </div>
      {ariaDescription && (
        <p id={`${inputId}-desc`} className="text-muted-foreground text-[11px]">
          {ariaDescription}
        </p>
      )}
      <div
        role="group"
        aria-label="Cores sugeridas"
        className="flex flex-wrap gap-1.5"
      >
        {presets.map((preset) => {
          const active = normalizeHex(preset) === normalizeHex(value)
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              aria-pressed={active}
              aria-label={`Usar cor ${preset}`}
              className={cn(
                "border-border/60 focus-visible:ring-ring focus-visible:ring-offset-background size-6 rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                active && "ring-foreground ring-2 ring-offset-2",
              )}
              style={{ backgroundColor: preset }}
            />
          )
        })}
      </div>
      {contrast && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
            contrast.level === "AAA" &&
              "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
            contrast.level === "AA" &&
              "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
            contrast.level === "AA-large" &&
              "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
            contrast.level === "fail" &&
              "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
          )}
        >
          {contrast.label}
        </p>
      )}
    </div>
  )
}

function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase()
  if (!v) return ""
  return v.startsWith("#") ? v : `#${v}`
}
