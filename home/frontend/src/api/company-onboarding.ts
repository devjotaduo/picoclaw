import { launcherFetch } from "@/api/http"

export interface CompanyOnboardingItem {
  id: string
  title: string
  description: string
  source: string
  completed: boolean
}

export interface CompanyOnboardingStatus {
  workspace: string
  generated_at: string
  total: number
  completed: number
  missing: number
  items: CompanyOnboardingItem[]
}

export async function getCompanyOnboardingStatus(): Promise<CompanyOnboardingStatus> {
  const res = await launcherFetch("/api/workspace/company-onboarding")
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json() as Promise<CompanyOnboardingStatus>
}
