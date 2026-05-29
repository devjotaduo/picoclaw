import { describe, expect, it } from "vitest"

import type { OnboardingJourneyState } from "@/api/onboarding-state"
import {
  onboardingAreaProgress,
  onboardingPhaseLabel,
  onboardingSteps,
  readableBlocker,
} from "@/lib/onboarding-lifecycle"

describe("onboarding lifecycle helpers", () => {
  it("orders Catarina areas by the canonical public tenant model", () => {
    const progress = onboardingAreaProgress({
      ...state("deepening_in_progress"),
      deepening: {
        ...state("deepening_in_progress").deepening,
        areas_required: ["faq", "equipe", "regras-tacitas"],
        areas_covered: ["faq"],
      },
    })

    expect(progress.areas.map((area) => area.key)).toEqual([
      "equipe",
      "faq",
      "regras-tacitas",
    ])
    expect(progress.covered).toBe(1)
    expect(progress.pct).toBe(33)
  })

  it("marks the promoted journey as complete", () => {
    const steps = onboardingSteps({
      ...state("promoted"),
      discovery: {
        ...state("promoted").discovery,
        completed_at: "2026-05-26T22:50:00Z",
      },
      deepening: {
        ...state("promoted").deepening,
        completed_at: "2026-05-26T23:20:00Z",
        areas_covered: [
          "equipe",
          "casos-excecao",
          "faq",
          "historico",
          "regras-tacitas",
        ],
      },
      promotion: {
        ready: false,
        blocked_by: [],
        promoted_at: "2026-05-27T10:00:00Z",
        promoted_by: "rutherles@gmail.com",
      },
    })

    expect(steps.map((step) => step.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ])
    expect(onboardingPhaseLabel("promoted")).toBe("Tenant promovido")
  })

  it("turns machine blockers into operator-facing text", () => {
    expect(readableBlocker("owner_whatsapp_missing")).toContain("WhatsApp")
    expect(readableBlocker("deepening_incomplete: faq,historico")).toContain(
      "FAQ ampliada",
    )
    expect(readableBlocker("lead_timeout_days: 9")).toBe(
      "Lead sem responder há 9 dia(s)",
    )
  })
})

function state(phase: string): OnboardingJourneyState {
  return {
    schema_version: 3,
    phase,
    discovery: {
      started_at: "2026-05-26T22:30:00Z",
      completed_at: null,
      segment: null,
      summary: null,
      agent: "sofia",
    },
    deepening: {
      started_at: null,
      first_contact_at: null,
      last_outreach_at: null,
      last_owner_response_at: null,
      last_bridge_attempt_at: null,
      last_bridge_failed_at: null,
      last_bridge_error: null,
      areas_covered: [],
      areas_required: [
        "equipe",
        "casos-excecao",
        "faq",
        "historico",
        "regras-tacitas",
      ],
      completed_at: null,
      agent: "catarina",
    },
    owner_captured: {},
    promotion: {
      ready: false,
      blocked_by: [],
      promoted_at: null,
      promoted_by: null,
    },
  }
}
