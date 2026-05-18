import { launcherFetch } from "@/api/http"

export type LauncherFeatureAccess = "none" | "read" | "write"

export interface LauncherPolicyResponse {
  role: string
  feature_ids: string[]
  features: Record<string, LauncherFeatureAccess>
  ui?: {
    show_reasoning?: boolean
    show_tool_calls?: boolean
    show_model_selector?: boolean
  }
}

export async function getLauncherPolicy(): Promise<LauncherPolicyResponse> {
  const res = await launcherFetch("/api/launcher/policy")
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<LauncherPolicyResponse>
}
