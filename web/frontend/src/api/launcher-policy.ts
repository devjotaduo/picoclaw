import { launcherFetch } from "@/api/http"

export type LauncherFeatureAccess = "none" | "read" | "write"

export interface LauncherQuickTask {
  label: string
  prompt: string
  icon?: string
}

export interface LauncherPolicyResponse {
  role: string
  feature_ids: string[]
  features: Record<string, LauncherFeatureAccess>
  ui?: {
    show_reasoning?: boolean
    show_tool_calls?: boolean
    show_model_selector?: boolean
    chat_intro?: string
    quick_tasks?: LauncherQuickTask[]
  }
  /**
   * True when the launcher is configured to act as a SaaS admin (env vars
   * PICOCLAW_SAAS_ADMIN_MODE=true + BASE_URL + EMAIL + PASSWORD all set, and
   * the requesting role is platform_admin). Kept as backend capability state;
   * frontend page rendering no longer blocks on this flag.
   */
  is_saas_admin?: boolean
}

export async function getLauncherPolicy(): Promise<LauncherPolicyResponse> {
  const res = await launcherFetch("/api/launcher/policy")
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<LauncherPolicyResponse>
}
