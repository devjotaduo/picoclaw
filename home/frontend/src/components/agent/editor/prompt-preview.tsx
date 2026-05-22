import { IconChevronRight, IconClipboard } from "@tabler/icons-react"
import { useState } from "react"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { describePayloadSources } from "./prompt-sources"

export interface PromptPreviewProps {
  payload: TemplateApplyPayload | null
  defaultOpen?: boolean
}

export function PromptPreview({
  payload,
  defaultOpen = false,
}: PromptPreviewProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)
  const sections = payload ? describePayloadSources(payload) : []

  function copyAll() {
    if (!payload) return
    void navigator.clipboard
      ?.writeText(JSON.stringify(payload, null, 2))
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }

  return (
    <section
      className="border-border/60 bg-card/60 rounded-2xl border shadow-sm"
      aria-labelledby="prompt-preview-heading"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="prompt-preview-body"
        className="hover:bg-muted/40 focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <div className="flex items-center gap-2">
          <IconChevronRight
            className={cn(
              "text-muted-foreground size-4 transition-transform",
              open && "rotate-90",
            )}
            aria-hidden="true"
          />
          <h3 id="prompt-preview-heading" className="text-sm font-semibold">
            Preview do prompt compilado
          </h3>
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            tempo real
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {payload ? `${sections.length} seções` : "—"}
        </span>
      </button>
      {open && (
        <div id="prompt-preview-body" className="border-border/40 border-t">
          {!payload ? (
            <p className="text-muted-foreground p-4 text-xs">
              Sem payload aplicado. Configure o prompt para gerar o preview.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-4 py-2">
                <ul className="flex flex-wrap gap-1.5">
                  {sections.map((s) => (
                    <li
                      key={s.key}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        SOURCE_COLORS[s.source],
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current opacity-70" />
                      {s.label}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyAll}
                  aria-label="Copiar JSON do prompt"
                  className="gap-1 text-xs"
                >
                  <IconClipboard className="size-3.5" aria-hidden="true" />
                  {copied ? "Copiado" : "Copiar JSON"}
                </Button>
              </div>
              <pre
                aria-label="Prompt compilado"
                className="bg-muted/30 max-h-72 overflow-auto p-4 font-mono text-[11px] leading-relaxed"
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const SOURCE_COLORS: Record<string, string> = {
  profile: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  role: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  skills:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  context:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  meta: "bg-muted text-muted-foreground",
}
