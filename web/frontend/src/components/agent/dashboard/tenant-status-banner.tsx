import {
  IconCheck,
  IconClock,
  IconExternalLink,
  IconLoader2,
  IconRocket,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"

import {
  type CompanyOnboardingStatus,
  getCompanyOnboardingStatus,
} from "@/api/company-onboarding"
import { getOnboardingState } from "@/api/onboarding-state"
import { finishTestMode, getTestModeStatus } from "@/api/test-mode"
import {
  DEFAULT_UI_VISIBILITY_POLICY,
  type UIVisibilityProfile,
  getLocalUIVisibilityPolicy,
} from "@/api/ui-visibility"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDashboardDate } from "@/lib/agent-dashboard"
import { onboardingPhaseLabel } from "@/lib/onboarding-lifecycle"
import { cn } from "@/lib/utils"

// Banner que vai no TOPO do painel — comunica em uma olhada o estado
// do tenant (discovery, esperando contato, ativo) + atalhos pra ações
// que dependem desse estado.
//
// Estados (lê de ui-visibility.json e empresa.md via launcher API):
//   - public  → "Em discovery (Sofia conduzindo)"
//   - waiting → "Aguardando contato do time" (deve nem chegar — overlay
//     cobre tudo, mas resiliência)
//   - tenant  → "Operação ativa"
//   - admin   → "Modo administrativo"
//
// Os outros sub-componentes (ReadinessCard, CatarinaProgressCard) leem
// dos endpoints existentes /api/workspace/company-onboarding e listagem
// de memory/ para mostrar progresso.

interface TenantStatusBannerProps {
  className?: string
}

const PROFILE_META: Record<
  UIVisibilityProfile,
  {
    label: string
    tone: "discovery" | "waiting" | "active" | "admin" | "test"
    description: string
  }
> = {
  public: {
    label: "Em discovery",
    tone: "discovery",
    description: "A Sofia está conduzindo o cadastro inicial da empresa.",
  },
  waiting: {
    label: "Aguardando contato",
    tone: "waiting",
    description:
      "Discovery concluído. O time da Jotaduo está finalizando os preparativos.",
  },
  test: {
    label: "Modo teste",
    tone: "test",
    description:
      "Pico Web está conferindo pendências antes da liberação para produção.",
  },
  tenant: {
    label: "Operação ativa",
    tone: "active",
    description:
      "Equipe liberada. Os agentes operacionais já podem atender com contexto.",
  },
  admin: {
    label: "Modo administrativo",
    tone: "admin",
    description: "Painel completo com ferramentas técnicas habilitadas.",
  },
}

const TONE_CLASSES: Record<
  (typeof PROFILE_META)[UIVisibilityProfile]["tone"],
  string
> = {
  discovery:
    "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100",
  waiting: "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-100",
  active:
    "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100",
  admin:
    "border-violet-500/30 bg-violet-500/5 text-violet-900 dark:text-violet-100",
  test: "border-cyan-500/30 bg-cyan-500/5 text-cyan-900 dark:text-cyan-100",
}

export function TenantStatusBanner({ className }: TenantStatusBannerProps) {
  const qc = useQueryClient()
  const policyQuery = useQuery({
    queryKey: ["ui-visibility-policy", "local-json", "dashboard-banner"],
    queryFn: getLocalUIVisibilityPolicy,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const onboardingQuery = useQuery<CompanyOnboardingStatus>({
    queryKey: ["company-onboarding", "dashboard-banner"],
    queryFn: getCompanyOnboardingStatus,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const onboardingStateQuery = useQuery({
    queryKey: ["workspace-onboarding-state", "dashboard-banner"],
    queryFn: getOnboardingState,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const testModeQuery = useQuery({
    queryKey: ["workspace-test-mode", "dashboard-banner"],
    queryFn: getTestModeStatus,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const finishTestMutation = useMutation({
    mutationFn: finishTestMode,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workspace-test-mode"] }),
        qc.invalidateQueries({ queryKey: ["workspace-onboarding-state"] }),
        qc.invalidateQueries({ queryKey: ["ui-visibility-policy"] }),
      ])
    },
  })

  const policy = policyQuery.data ?? DEFAULT_UI_VISIBILITY_POLICY
  const profile = (policy.active_profile ??
    policy.default_profile) as UIVisibilityProfile
  const state = onboardingStateQuery.data?.state
  const phase = state?.phase
  const testMode = testModeQuery.data
  const isTestMode = profile === "test" || testMode?.in_test
  const isPromoted = phase === "promoted"
  const isTenantProfileOutOfSync =
    profile === "tenant" &&
    onboardingStateQuery.data?.exists &&
    !isPromoted &&
    state?.testing?.status !== "production"
  const baseMeta = PROFILE_META[profile] ?? PROFILE_META.tenant
  const meta = isTestMode
    ? PROFILE_META.test
    : profile === "tenant" && isPromoted
      ? {
          ...baseMeta,
          label: "Tenant promovido",
          description:
            "Sofia concluiu o discovery, Catarina aprofundou o contexto e o admin liberou a operação.",
        }
      : isTenantProfileOutOfSync
        ? {
            ...baseMeta,
            label: "Operação ativa com estado pendente",
            description:
              "A UI está liberada como tenant, mas a jornada ainda não marcou promoção.",
          }
        : baseMeta
  const tone = TONE_CLASSES[meta.tone]

  const handleFinishTest = () => {
    if (!testMode?.can_finish || finishTestMutation.isPending) return
    const ok = window.confirm(
      "Finalizar modo teste e liberar este tenant para produção?",
    )
    if (ok) {
      finishTestMutation.mutate()
    }
  }

  const readiness = useMemo(() => {
    const onb = onboardingQuery.data
    if (!onb) return null
    const filled = typeof onb.completed === "number" ? onb.completed : null
    const total = typeof onb.total === "number" ? onb.total : null
    if (filled == null || total == null || total === 0) return null
    return {
      filled,
      total,
      pct: Math.round((filled / total) * 100),
      missing: Array.isArray(onb.items)
        ? onb.items.filter((item) => !item.completed).map((item) => item.title)
        : [],
    }
  }, [onboardingQuery.data])
  const phaseLabel = phase ? onboardingPhaseLabel(phase) : null
  const promotedAt = state?.promotion.promoted_at

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between md:gap-4",
          tone,
        )}
      >
        <div className="flex items-start gap-3 md:items-center">
          <div className="bg-background/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            {meta.tone === "active" ? (
              <IconCheck className="size-5" />
            ) : meta.tone === "waiting" ? (
              <IconClock className="size-5" />
            ) : meta.tone === "discovery" ? (
              <IconSparkles className="size-5" />
            ) : (
              <IconUsers className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{meta.label}</h2>
              <Badge variant="outline" className="border-current/30 text-xs">
                {profile}
              </Badge>
              {phaseLabel ? (
                <Badge variant="outline" className="border-current/30 text-xs">
                  {phaseLabel}
                </Badge>
              ) : null}
              {policyQuery.isFetching ? (
                <IconLoader2 className="text-muted-foreground size-3 animate-spin" />
              ) : null}
            </div>
            <p className="text-sm opacity-80">{meta.description}</p>
            {promotedAt ? (
              <p className="mt-1 text-xs opacity-70">
                Promovido em {formatDashboardDate(promotedAt ?? undefined)}
                {state?.promotion.promoted_by
                  ? ` por ${state.promotion.promoted_by}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>

        {readiness || isTestMode ? (
          <div className="flex flex-wrap items-center gap-3 self-start md:justify-end md:self-center">
            {isTestMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!testMode?.can_finish || finishTestMutation.isPending}
                onClick={handleFinishTest}
                title={
                  testMode?.blocked_by?.length
                    ? testMode.blocked_by.join(", ")
                    : undefined
                }
                className="border-current/40"
              >
                {finishTestMutation.isPending ? (
                  <IconLoader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <IconRocket className="mr-1 size-3" />
                )}
                Finalizar teste
              </Button>
            ) : null}
            {readiness ? (
              <>
                <div className="text-right">
                  <div className="text-2xl leading-none font-bold">
                    {readiness.pct}%
                  </div>
                  <div className="text-xs opacity-70">
                    {readiness.filled}/{readiness.total} campos cadastrados
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  className="border-current/40"
                >
                  <a href="/readiness">
                    Ver detalhes
                    <IconExternalLink className="ml-1 size-3" />
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {readiness &&
      readiness.pct < 100 &&
      readiness.missing.length > 0 &&
      profile !== "waiting" ? (
        <div className="border-border/60 bg-card/40 text-muted-foreground rounded-xl border px-4 py-3 text-xs">
          <span className="text-foreground font-medium">Faltam preencher:</span>{" "}
          {readiness.missing.slice(0, 5).join(", ")}
          {readiness.missing.length > 5
            ? ` (+${readiness.missing.length - 5} outros)`
            : ""}
        </div>
      ) : null}

      {isTenantProfileOutOfSync ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-100">
          Verifique a promoção no painel admin: o tenant já está com UI ativa,
          mas a jornada ainda aparece como {phaseLabel}.
        </div>
      ) : null}
    </section>
  )
}
