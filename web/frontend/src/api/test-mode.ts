import { launcherFetch } from "@/api/http"

export interface TestModeStatus {
  status: "not_configured" | "in_test" | "production" | string
  in_test: boolean
  completed_at?: string
  completed_by?: string
  completed_source?: string
  active_profile: string
  allow_from: string[]
  can_finish: boolean
  blocked_by: string[]
}

export interface FinishTestModeResponse {
  finished: boolean
  reason?: string
  status: TestModeStatus
}

export async function getTestModeStatus(): Promise<TestModeStatus> {
  const res = await launcherFetch("/api/workspace/test-mode", {
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<TestModeStatus>
}

export async function finishTestMode(): Promise<FinishTestModeResponse> {
  const res = await launcherFetch("/api/workspace/test-mode/finish", {
    method: "POST",
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | FinishTestModeResponse
      | null
    if (data) return data
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<FinishTestModeResponse>
}
