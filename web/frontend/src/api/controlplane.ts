/**
 * SaaS controlplane client — calls the launcher's own proxy at
 * `/api/admin/saas/*` (which forwards to the controlplane using credentials
 * configured in the launcher's env). The browser only talks to the launcher;
 * the controlplane session lives entirely server-side. No cross-subdomain
 * cookie, no CORS, no separate /admin/login.
 *
 * Gating: the sidebar group and the /admin/* routes only show when
 * `/api/launcher/policy` returns `is_saas_admin: true`. That flag flips on
 * when the launcher process has PICOCLAW_SAAS_ADMIN_MODE=true plus the four
 * required env vars (see web/backend/api/saas_client.go).
 */
import { launcherFetch } from "@/api/http"

const BASE = "/api/admin/saas"

export type TenantStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "deleting"
  | "error"

export interface Tenant {
  id: string
  display_name: string
  owner_email: string
  subdomain: string
  status: TenantStatus
  container_id: string | null
  mem_limit_mb: number
  cpu_quota: number
  monthly_budget_usd: number | null
  initial_password_delivered: boolean
  last_error: string | null
  created_at: string
  suspended_at: string | null
  crm_contact_id?: number | null
  launcher_profile_id?: string | null
  launcher_profile_version_applied?: number | null
}

export interface CreateTenantInput {
  display_name: string
  owner_email: string
  subdomain: string
  monthly_budget_usd?: number
  mem_limit_mb?: number
  cpu_quota?: number
}

export interface CreateTenantResponse {
  tenant_id: string
  url: string
  owner_invite_token?: string
  warning?: string
  info?: string
}

export interface CloneTenantInput {
  display_name: string
  owner_email: string
  subdomain: string
  monthly_budget_usd?: number
  mem_limit_mb?: number
  cpu_quota?: number
}

export type SanityStatus = "ok" | "warn" | "fail"

export interface SanityCheck {
  name: string
  status: SanityStatus
  message?: string
}

export interface CloneTenantResponse extends CreateTenantResponse {
  source_tenant_id: string
  sanity_checks: SanityCheck[]
}

export interface SanityResponse {
  tenant_id: string
  sanity_checks: SanityCheck[]
}

export interface LauncherProfileSummary {
  id: string
  name: string
  slug: string
  description: string
  is_default: boolean
  version: number
}

export interface RotatePasswordResponse {
  initial_password: string
  warning?: string
}

export class ControlplaneError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(`controlplane ${status}: ${detail}`)
    this.status = status
    this.detail = detail
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    if (data?.error) return data.error
  } catch {
    /* fall through */
  }
  return res.statusText || `status ${res.status}`
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers ?? {}),
  }
  const res = await launcherFetch(BASE + path, {
    cache: "no-store",
    ...init,
    headers,
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const detail = await readErrorBody(res)
    throw new ControlplaneError(res.status, detail)
  }
  return (await res.json()) as T
}

export async function listTenants(): Promise<Tenant[]> {
  const data = await call<{ tenants: Tenant[] }>("/tenants")
  return data.tenants ?? []
}

export async function getTenant(id: string): Promise<Tenant> {
  return call<Tenant>(`/tenants/${encodeURIComponent(id)}`)
}

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResponse> {
  return call<CreateTenantResponse>("/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function cloneTenant(
  sourceID: string,
  input: CloneTenantInput,
): Promise<CloneTenantResponse> {
  return call<CloneTenantResponse>(
    `/tenants/${encodeURIComponent(sourceID)}/clone`,
    { method: "POST", body: JSON.stringify(input) },
  )
}

export async function tenantSanity(id: string): Promise<SanityResponse> {
  return call<SanityResponse>(`/tenants/${encodeURIComponent(id)}/sanity`)
}

export async function suspendTenant(id: string): Promise<void> {
  await call<void>(`/tenants/${encodeURIComponent(id)}/suspend`, {
    method: "POST",
  })
}

export async function resumeTenant(id: string): Promise<void> {
  await call<void>(`/tenants/${encodeURIComponent(id)}/resume`, {
    method: "POST",
  })
}

export async function restartTenant(id: string): Promise<void> {
  await call<void>(`/tenants/${encodeURIComponent(id)}/restart`, {
    method: "POST",
  })
}

export async function recreateTenant(id: string): Promise<void> {
  await call<void>(`/tenants/${encodeURIComponent(id)}/recreate`, {
    method: "POST",
  })
}

export async function rotateTenantPassword(
  id: string,
): Promise<RotatePasswordResponse> {
  return call<RotatePasswordResponse>(
    `/tenants/${encodeURIComponent(id)}/rotate-password`,
    { method: "POST", body: JSON.stringify({}) },
  )
}

export async function deleteTenant(id: string): Promise<void> {
  await call<void>(`/tenants/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function listLauncherProfiles(): Promise<
  LauncherProfileSummary[]
> {
  const data = await call<{ profiles: LauncherProfileSummary[] }>(
    "/launcher-profiles",
  )
  return data.profiles ?? []
}
