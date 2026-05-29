import type { OnboardingJourneyState } from "@/api/onboarding-state"

export const ONBOARDING_AREA_LABELS: Record<string, string> = {
  equipe: "Equipe e profissionais",
  "casos-excecao": "Casos de exceção",
  faq: "FAQ ampliada",
  historico: "Histórico de problemas",
  "regras-tacitas": "Regras tácitas",
}

const CANONICAL_AREA_ORDER = [
  "equipe",
  "casos-excecao",
  "faq",
  "historico",
  "regras-tacitas",
] as const

const PHASE_LABELS: Record<string, string> = {
  discovery_in_progress: "Discovery em andamento",
  discovery_done: "Discovery concluído",
  deepening_in_progress: "Aprofundamento em andamento",
  ready_for_promotion: "Pronto para promoção",
  promoted: "Tenant promovido",
}

export interface OnboardingAreaStatus {
  key: string
  label: string
  covered: boolean
}

export interface OnboardingAreaProgress {
  areas: OnboardingAreaStatus[]
  covered: number
  total: number
  pct: number
}

export type OnboardingStepStatus = "done" | "current" | "pending"

export interface OnboardingStep {
  key: string
  label: string
  actor: string
  description: string
  status: OnboardingStepStatus
}

export function onboardingPhaseLabel(phase: string | undefined): string {
  if (!phase) return "Sem estado"
  return PHASE_LABELS[phase] ?? readableToken(phase)
}

export function onboardingAreaProgress(
  state: OnboardingJourneyState | null | undefined,
): OnboardingAreaProgress {
  const required = orderedAreas(state?.deepening?.areas_required ?? [])
  const coveredSet = new Set(state?.deepening?.areas_covered ?? [])
  const areas = required.map((key) => ({
    key,
    label: ONBOARDING_AREA_LABELS[key] ?? readableToken(key),
    covered: coveredSet.has(key),
  }))
  const covered = areas.filter((area) => area.covered).length
  const total = areas.length
  return {
    areas,
    covered,
    total,
    pct: total === 0 ? 0 : Math.round((covered / total) * 100),
  }
}

export function onboardingSteps(
  state: OnboardingJourneyState | null | undefined,
): OnboardingStep[] {
  const phase = state?.phase ?? "discovery_in_progress"
  const discoveryDone =
    Boolean(state?.discovery?.completed_at) ||
    phaseRank(phase) >= phaseRank("discovery_done")
  const deepeningDone =
    Boolean(state?.deepening?.completed_at) ||
    onboardingAreaProgress(state).pct === 100 ||
    phaseRank(phase) >= phaseRank("ready_for_promotion")
  const readyDone =
    Boolean(state?.promotion?.ready) ||
    phaseRank(phase) >= phaseRank("promoted")
  const promotedDone =
    phase === "promoted" || Boolean(state?.promotion?.promoted_at)

  return [
    {
      key: "discovery",
      label: "Discovery",
      actor: "Sofia",
      description: "Coleta identidade, segmento e contato do dono.",
      status: stepStatus(discoveryDone, phase === "discovery_in_progress"),
    },
    {
      key: "deepening",
      label: "Aprofundamento",
      actor: "Catarina",
      description: "Completa as áreas que evitam resposta genérica.",
      status: stepStatus(
        deepeningDone,
        phase === "discovery_done" || phase === "deepening_in_progress",
      ),
    },
    {
      key: "ready",
      label: "Pronto para promoção",
      actor: "Catarina/Admin",
      description: "Sem bloqueios relevantes para liberar o tenant.",
      status: stepStatus(readyDone, phase === "ready_for_promotion"),
    },
    {
      key: "promoted",
      label: "Promovido",
      actor: "Admin",
      description: "Painel do cliente ativo com agentes operacionais.",
      status: stepStatus(promotedDone, promotedDone),
    },
  ]
}

export function readableBlocker(value: string): string {
  const [kind, detail] = value.split(":", 2).map((part) => part.trim())
  switch (kind) {
    case "discovery_incomplete":
      return "Sofia ainda não marcou o discovery como concluído"
    case "owner_email_missing":
      return "E-mail do responsável ainda não foi capturado"
    case "owner_whatsapp_missing":
      return "WhatsApp do responsável ainda não foi capturado"
    case "empresa_memory_empty":
      return detail
        ? `Memória da empresa incompleta: ${detail}`
        : "Memória da empresa incompleta"
    case "deepening_incomplete":
      return detail
        ? `Aprofundamento pendente: ${detail
            .split(",")
            .map((area) => ONBOARDING_AREA_LABELS[area.trim()] ?? area.trim())
            .join(", ")}`
        : "Aprofundamento pendente"
    case "lead_timeout_days":
      return detail
        ? `Lead sem responder há ${detail} dia(s)`
        : "Lead sem resposta recente"
    default:
      return readableToken(value)
  }
}

function orderedAreas(input: string[]): string[] {
  const unique = new Set(input.length > 0 ? input : CANONICAL_AREA_ORDER)
  const ordered = CANONICAL_AREA_ORDER.filter((key) => unique.delete(key))
  return [...ordered, ...Array.from(unique).sort()]
}

function stepStatus(done: boolean, current: boolean): OnboardingStepStatus {
  if (done) return "done"
  return current ? "current" : "pending"
}

function phaseRank(phase: string): number {
  switch (phase) {
    case "discovery_in_progress":
      return 0
    case "discovery_done":
      return 1
    case "deepening_in_progress":
      return 2
    case "ready_for_promotion":
      return 3
    case "promoted":
      return 4
    default:
      return -1
  }
}

function readableToken(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
