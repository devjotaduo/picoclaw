import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconExternalLink,
  IconLoader2,
  IconMail,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { getOnboardingState } from "@/api/onboarding-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDashboardDate } from "@/lib/agent-dashboard"
import {
  type OnboardingStepStatus,
  onboardingAreaProgress,
  onboardingPhaseLabel,
  onboardingSteps,
  readableBlocker,
} from "@/lib/onboarding-lifecycle"
import { cn } from "@/lib/utils"

export function OnboardingLifecycleCard({ className }: { className?: string }) {
  const query = useQuery({
    queryKey: ["workspace-onboarding-state", "dashboard"],
    queryFn: getOnboardingState,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  if (query.isLoading) {
    return (
      <section
        className={cn(
          "border-border/60 bg-card flex min-h-48 items-center justify-center rounded-xl border p-5",
          className,
        )}
      >
        <IconLoader2 className="text-muted-foreground size-5 animate-spin" />
      </section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <section
        className={cn(
          "border-border/60 bg-card rounded-xl border p-5",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
          <IconAlertTriangle className="size-4" />
          Estado do onboarding indisponível
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Não foi possível carregar a jornada de onboarding.
        </p>
      </section>
    )
  }

  const state = query.data.state
  const progress = onboardingAreaProgress(state)
  const steps = onboardingSteps(state)
  const owner = state.owner_captured
  const blockers = state.promotion.blocked_by ?? []
  const isPromoted = state.phase === "promoted"
  const hasBridgeError = Boolean(state.deepening.last_bridge_failed_at)

  return (
    <section
      className={cn(
        "border-border/60 bg-card flex flex-col gap-5 rounded-xl border p-5",
        className,
      )}
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <IconSparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Jornada do tenant
              </h3>
              <p className="text-muted-foreground text-xs">
                Sofia, Catarina e promoção do painel do cliente
              </p>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "w-fit",
            isPromoted
              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/40 text-amber-700 dark:text-amber-300",
          )}
        >
          {onboardingPhaseLabel(state.phase)}
        </Badge>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        {steps.map((step) => (
          <LifecycleStep key={step.key} step={step} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="border-border/50 bg-muted/20 rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-foreground text-xs font-semibold">
              Responsável capturado
            </h4>
            {owner.captured_at ? (
              <span className="text-muted-foreground text-xs">
                {formatDashboardDate(owner.captured_at ?? undefined)}
              </span>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm">
            <OwnerLine
              icon={<IconUser className="size-4" />}
              label="Nome"
              value={owner.name}
            />
            <OwnerLine
              icon={<IconMail className="size-4" />}
              label="E-mail"
              value={owner.email}
            />
            <OwnerLine
              icon={<IconBrandWhatsapp className="size-4" />}
              label="WhatsApp"
              value={owner.whatsapp}
            />
          </dl>
        </div>

        <div className="border-border/50 bg-muted/20 rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-foreground text-xs font-semibold">
              Aprofundamento por área
            </h4>
            <span className="text-muted-foreground text-xs">
              {progress.covered}/{progress.total} ({progress.pct}%)
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {progress.areas.map((area) => (
              <div
                key={area.key}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-xs",
                  area.covered
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-border/50 text-muted-foreground",
                )}
              >
                {area.covered ? (
                  <IconCheck className="size-3.5 shrink-0" />
                ) : (
                  <IconClock className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{area.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {state.discovery.summary || state.discovery.segment ? (
        <div className="border-border/50 rounded-lg border px-3 py-2.5">
          <div className="text-muted-foreground mb-1 text-xs">
            Resumo da Sofia
            {state.discovery.segment ? ` · ${state.discovery.segment}` : ""}
          </div>
          {state.discovery.summary ? (
            <p className="text-foreground text-sm leading-relaxed">
              {state.discovery.summary}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasBridgeError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Falha ao acionar Catarina:{" "}
          {state.deepening.last_bridge_error || "erro sem detalhe registrado"}
        </div>
      ) : null}

      {!isPromoted && blockers.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            Bloqueios antes da promoção
          </div>
          <ul className="grid gap-1 text-xs text-amber-900 dark:text-amber-100">
            {blockers.slice(0, 4).map((blocker) => (
              <li key={blocker}>{readableBlocker(blocker)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/readiness">
            Ver prontidão
            <IconExternalLink className="ml-1 size-3" />
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/agent/whatsapp">
            WhatsApp
            <IconChevronRight className="ml-1 size-3" />
          </a>
        </Button>
      </footer>
    </section>
  )
}

function LifecycleStep({
  step,
}: {
  step: ReturnType<typeof onboardingSteps>[number]
}) {
  const tone = STEP_TONE[step.status]
  return (
    <article className={cn("rounded-lg border px-3 py-3", tone.container)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{step.label}</span>
        <StepDot status={step.status} />
      </div>
      <div className="text-muted-foreground text-xs">{step.actor}</div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed">
        {step.description}
      </p>
    </article>
  )
}

function StepDot({ status }: { status: OnboardingStepStatus }) {
  if (status === "done") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
        <IconCheck className="size-3" />
      </span>
    )
  }
  if (status === "current") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <IconClock className="size-3" />
      </span>
    )
  }
  return <span className="bg-muted h-2.5 w-2.5 rounded-full" />
}

function OwnerLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value?: string | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <dt className="text-muted-foreground w-16 shrink-0 text-xs">{label}</dt>
      <dd className="text-foreground min-w-0 truncate text-sm">
        {value?.trim() || "Pendente"}
      </dd>
    </div>
  )
}

const STEP_TONE: Record<OnboardingStepStatus, { container: string }> = {
  done: {
    container:
      "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200",
  },
  current: {
    container:
      "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100",
  },
  pending: {
    container: "border-border/50 bg-muted/20 text-muted-foreground",
  },
}
