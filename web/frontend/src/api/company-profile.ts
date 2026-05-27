import { launcherFetch } from "@/api/http"

export type CompanyProfileFieldKind = "text" | "textarea" | "select"
export type CompanyProfileFieldStatus =
  | "missing"
  | "pending"
  | "filled"
  | "validated"

export interface CompanyProfileField {
  id: string
  group_id: string
  label: string
  description: string
  source: string
  markdown_label: string
  kind: CompanyProfileFieldKind
  value: string
  required: boolean
  status: CompanyProfileFieldStatus
  agents: string[]
  options?: string[]
}

export interface CompanyProfileGroup {
  id: string
  title: string
  description: string
  total: number
  completed: number
  missing: number
  fields: CompanyProfileField[]
}

export interface CompanyProfileResponse {
  workspace: string
  generated_at: string
  total: number
  completed: number
  missing: number
  groups: CompanyProfileGroup[]
}

export interface CompanyProfileSaveResponse {
  workspace: string
  updated_at: string
  updated: number
  backup_paths?: Record<string, string>
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function getCompanyProfile(): Promise<CompanyProfileResponse> {
  const res = await launcherFetch("/api/workspace/company-profile")
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<CompanyProfileResponse>
}

export async function saveCompanyProfile(
  fields: Record<string, string>,
): Promise<CompanyProfileSaveResponse> {
  const res = await launcherFetch("/api/workspace/company-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<CompanyProfileSaveResponse>
}
