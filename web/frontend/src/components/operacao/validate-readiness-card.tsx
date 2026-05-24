import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  type ValidateReadinessResponse,
  countReadinessProgress,
  extractSegmentChecks,
  getValidateReadiness,
} from "@/api/validate-readiness"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const universalLabels: Record<string, string> = {
  nome: "Nome da empresa",
  segmento: "Segmento definido",
  contato_email: "E-mail de contato",
  contato_whatsapp: "WhatsApp de contato",
}

const segmentNames: Record<string, string> = {
  saude: "Saúde / Clínica",
  alimentacao: "Alimentação",
  ecommerce: "E-commerce",
  educacao: "Educação",
  servicos: "Serviços",
  imobiliaria: "Imobiliária",
  beleza: "Beleza / Estética",
  juridico: "Jurídico",
  consultoria: "Consultoria",
  generico: "Genérico",
}

function humanizeKey(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim()
}

function segmentDisplayName(key: string): string {
  return segmentNames[key] ?? humanizeKey(key)
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

function CheckRow({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <IconCircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <IconCircleX className="text-muted-foreground/70 size-4 shrink-0" />
      )}
      <span
        className={cn(
          done ? "text-foreground/90" : "text-muted-foreground",
          !done && "line-through decoration-dotted",
        )}
      >
        {label}
      </span>
    </li>
  )
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: { done: number; total: number }
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-border/50 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="text-foreground/90 flex items-center gap-2 text-sm font-medium">
          {open ? (
            <IconChevronDown className="size-4 opacity-60" />
          ) : (
            <IconChevronRight className="size-4 opacity-60" />
          )}
          {title}
        </span>
        {count ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {count.done}/{count.total}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-border/40 border-t px-4 py-3">{children}</div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header status pill
// ---------------------------------------------------------------------------

function headerTone(
  resp: ValidateReadinessResponse,
  done: number,
  total: number,
) {
  if (resp.ok) {
    return {
      label: "Pronto para atender",
      className:
        "border border-emerald-600/30 bg-emerald-600/15 text-emerald-600 dark:text-emerald-400",
      icon: <IconCircleCheck className="size-4" />,
    }
  }
  const pct = total === 0 ? 0 : done / total
  if (pct >= 0.7) {
    return {
      label: "Quase lá",
      className:
        "border border-amber-600/30 bg-amber-600/15 text-amber-600 dark:text-amber-400",
      icon: <IconAlertTriangle className="size-4" />,
    }
  }
  return {
    label: "Faltando informação",
    className:
      "border border-red-600/30 bg-red-600/15 text-red-600 dark:text-red-400",
    icon: <IconCircleX className="size-4" />,
  }
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function ValidateReadinessCard() {
  const query = useQuery({
    queryKey: ["workspace-validate-readiness"],
    queryFn: getValidateReadiness,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  if (query.isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="px-5">
          <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Verificando prontidão do workspace...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Card className="border-border/50">
        <CardContent className="px-5">
          <div className="text-destructive flex items-start gap-2 py-2 text-sm">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {(query.error as Error)?.message ||
                "Erro ao verificar prontidão do workspace"}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const resp = query.data
  const { done, total } = countReadinessProgress(resp)
  const tone = headerTone(resp, done, total)
  const seg = extractSegmentChecks(resp)

  const universalDone = Object.values(resp.universal).filter(Boolean).length
  const universalTotal = Object.values(resp.universal).length

  const segDone = seg
    ? Object.values(seg.checks).filter(Boolean).length
    : 0
  const segTotal = seg ? Object.values(seg.checks).length : 0

  const integracoes = resp.integracoes_required ?? []
  const integracoesDone = integracoes.filter(
    (i) => i.status === "resolved",
  ).length

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Prontidão do workspace</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              {done} de {total} itens prontos
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
              tone.className,
            )}
          >
            {tone.icon}
            {tone.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-5 pt-0">
        {/* Universal */}
        <CollapsibleSection
          title="Informações universais"
          count={{ done: universalDone, total: universalTotal }}
        >
          <ul className="space-y-1.5">
            {(Object.keys(resp.universal) as (keyof typeof resp.universal)[]).map(
              (k) => (
                <CheckRow
                  key={k}
                  label={universalLabels[k] ?? humanizeKey(k)}
                  done={resp.universal[k]}
                />
              ),
            )}
          </ul>
        </CollapsibleSection>

        {/* Segment */}
        {seg ? (
          <CollapsibleSection
            title={`Segmento detectado: ${segmentDisplayName(seg.key)}`}
            count={{ done: segDone, total: segTotal }}
          >
            <ul className="space-y-1.5">
              {Object.entries(seg.checks).map(([k, v]) => (
                <CheckRow key={k} label={humanizeKey(k)} done={v} />
              ))}
            </ul>
          </CollapsibleSection>
        ) : null}

        {/* Required integrations */}
        {integracoes.length > 0 ? (
          <CollapsibleSection
            title="Integrações requeridas"
            count={{ done: integracoesDone, total: integracoes.length }}
            defaultOpen={integracoesDone < integracoes.length}
          >
            <ul className="space-y-2.5">
              {integracoes.map((item) => {
                const resolved = item.status === "resolved"
                return (
                  <li
                    key={item.key}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground/90 text-sm font-medium">
                        {humanizeKey(item.key)}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                        {item.admin_action}
                      </p>
                    </div>
                    {resolved ? (
                      <Badge
                        variant="default"
                        className="shrink-0 border border-emerald-600/30 bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/20"
                      >
                        Resolvida
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground shrink-0 border-amber-600/30 bg-amber-600/10 text-amber-600 dark:text-amber-400"
                      >
                        Pendente
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </CollapsibleSection>
        ) : null}

        {/* Missing summary as a soft footer */}
        {resp.missing_summary && resp.missing_summary.length > 0 ? (
          <p className="text-muted-foreground border-border/40 border-t pt-3 text-xs">
            Faltando: {resp.missing_summary.join(" · ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
