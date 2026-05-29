import {
  IconBook2,
  IconCheck,
  IconClock,
  IconExternalLink,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { getOnboardingState } from "@/api/onboarding-state"
import { type MemoryFile, listMemoryFiles } from "@/api/workspace-memory"
import { Button } from "@/components/ui/button"
import { onboardingAreaProgress } from "@/lib/onboarding-lifecycle"
import { cn } from "@/lib/utils"

// Card que mostra progresso da curadoria da Catarina por área temática.
// Lê /api/workspace/memory e mapeia cada arquivo conhecido contra uma das
// 5 áreas universais de aprofundamento. Considera "preenchido" quando o
// arquivo existe E tem mais de MIN_CONTENT_BYTES (proxy de "tem conteúdo
// real", não só placeholder).
//
// Áreas (devem casar com os playbooks em
// workspace/skills/aprofundar-empresa/references/area-*.md):
//   1. profissionais  (equipe, horários individuais)
//   2. casos de exceção
//   3. FAQ ampliada
//   4. histórico de problemas
//   5. regras tácitas

const MIN_CONTENT_BYTES = 200

// Cada área tem múltiplos nomes de arquivo aceitos (Catarina ou agentes
// anteriores podem ter usado nomes ligeiramente diferentes). O primeiro
// que aparecer com tamanho > MIN conta.
const AREA_DEFINITIONS: ReadonlyArray<{
  key: string
  label: string
  candidates: string[]
}> = [
  {
    key: "profissionais",
    label: "Equipe e profissionais",
    candidates: ["profissionais.md", "equipe.md"],
  },
  {
    key: "casos-excecao",
    label: "Casos de exceção",
    candidates: ["casos-excecao.md", "excecoes.md", "casos-extremos.md"],
  },
  {
    key: "faq-ampliada",
    label: "FAQ ampliada",
    candidates: ["faq-ampliada.md", "faq.md"],
  },
  {
    key: "historico-problemas",
    label: "Histórico de problemas",
    candidates: [
      "historico-problemas.md",
      "historico.md",
      "correcoes.md",
      "lacunas.md",
    ],
  },
  {
    key: "regras-tacitas",
    label: "Regras tácitas",
    candidates: ["regras-tacitas.md", "padroes.md", "regras.md"],
  },
]

export function CatarinaProgressCard({ className }: { className?: string }) {
  const stateQuery = useQuery({
    queryKey: ["workspace-onboarding-state", "catarina-progress"],
    queryFn: getOnboardingState,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const memoryQuery = useQuery({
    queryKey: ["workspace-memory", "catarina-progress"],
    queryFn: listMemoryFiles,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const progress = useMemo(() => {
    const state = stateQuery.data?.state
    if (stateQuery.data?.exists && state) {
      const fromState = onboardingAreaProgress(state)
      return {
        areas: fromState.areas.map((area) => ({
          key: area.key,
          label: area.label,
          filled: area.covered,
          matchedFile: undefined,
          bytes: 0,
        })),
        filled: fromState.covered,
        total: fromState.total,
        pct: fromState.pct,
        source: "state" as const,
      }
    }

    const files = memoryQuery.data?.files ?? []
    const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
    const areas = AREA_DEFINITIONS.map((area) => {
      const matched = area.candidates
        .map((n) => byName.get(n.toLowerCase()))
        .find((f): f is MemoryFile => !!f && f.size >= MIN_CONTENT_BYTES)
      return {
        key: area.key,
        label: area.label,
        filled: !!matched,
        matchedFile: matched?.name,
        bytes: matched?.size ?? 0,
      }
    })
    const filledCount = areas.filter((a) => a.filled).length
    return {
      areas,
      filled: filledCount,
      total: areas.length,
      pct: Math.round((filledCount / areas.length) * 100),
      source: "memory" as const,
    }
  }, [memoryQuery.data, stateQuery.data])

  if (!stateQuery.data && !memoryQuery.data && !stateQuery.isError) {
    return null
  }

  // Não renderiza se ainda não temos dados ou se as duas fontes erraram —
  // evita ruído no dashboard. Operador vê erros via console / log.
  if (stateQuery.isError && (memoryQuery.isError || !memoryQuery.data?.files)) {
    return null
  }

  return (
    <section
      className={cn(
        "border-border/60 bg-card flex flex-col gap-4 rounded-xl border p-5",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
            <IconBook2 className="size-5" />
          </div>
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              Aprofundamento (Catarina)
            </h3>
            <p className="text-muted-foreground text-xs">
              {progress.source === "state"
                ? "Progresso registrado pela Catarina"
                : "Estimado pelas memórias salvas"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-foreground text-2xl leading-none font-bold">
            {progress.filled}/{progress.total}
          </div>
          <div className="text-muted-foreground text-xs">
            {progress.pct}% mapeado
          </div>
        </div>
      </header>

      <div className="bg-muted/40 h-2 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {progress.areas.map((area) => (
          <li
            key={area.key}
            className={cn(
              "border-border/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
              area.filled
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "bg-muted/20",
            )}
          >
            <span
              className={cn(
                "truncate",
                area.filled
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {area.label}
            </span>
            <span
              className={cn(
                "text-xs",
                area.filled
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground/60",
              )}
            >
              {area.filled ? (
                <IconCheck className="size-3.5" />
              ) : (
                <IconClock className="size-3.5" />
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/readiness">
            Ver prontidão
            <IconExternalLink className="ml-1 size-3" />
          </a>
        </Button>
      </div>
    </section>
  )
}
