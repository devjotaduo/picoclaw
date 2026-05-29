import { launcherFetch } from "@/api/http"

export type OnboardingPhase =
  | "discovery_in_progress"
  | "discovery_done"
  | "deepening_in_progress"
  | "ready_for_promotion"
  | "promoted"
  | string

export interface OnboardingDiscovery {
  started_at?: string | null
  completed_at?: string | null
  segment?: string | null
  summary?: string | null
  agent: string
}

export interface OnboardingDeepening {
  started_at?: string | null
  first_contact_at?: string | null
  last_outreach_at?: string | null
  last_owner_response_at?: string | null
  last_bridge_attempt_at?: string | null
  last_bridge_failed_at?: string | null
  last_bridge_error?: string | null
  areas_covered: string[]
  areas_required: string[]
  completed_at?: string | null
  agent: string
  forced_completion_reason?: string | null
}

export interface OnboardingOwnerCaptured {
  name?: string | null
  email?: string | null
  whatsapp?: string | null
  captured_by?: string | null
  captured_at?: string | null
}

export interface OnboardingPromotion {
  ready: boolean
  blocked_by: string[]
  promoted_at?: string | null
  promoted_by?: string | null
}

export interface OnboardingJourneyState {
  schema_version?: number
  phase: OnboardingPhase
  discovery: OnboardingDiscovery
  deepening: OnboardingDeepening
  owner_captured: OnboardingOwnerCaptured
  promotion: OnboardingPromotion
}

export interface OnboardingStateResponse {
  workspace: string
  exists: boolean
  generated_at: string
  state: OnboardingJourneyState
}

export async function getOnboardingState(): Promise<OnboardingStateResponse> {
  const res = await launcherFetch("/api/workspace/onboarding-state")
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<OnboardingStateResponse>
}
