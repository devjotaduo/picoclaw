/**
 * SaaS controlplane client — calls the launcher's own proxy at
 * `/api/admin/saas/*` (which forwards to the controlplane using credentials
 * configured in the launcher's env). The browser only talks to the launcher;
 * the controlplane session lives entirely server-side. No cross-subdomain
 * cookie, no CORS, no separate /admin/login.
 *
 * Access is enforced by the launcher/controlplane APIs. The frontend renders
 * these pages according to the local visibility profile and lets backend
 * responses surface any real permission or proxy errors.
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

/**
 * Admin-facing tenant type. Maps to ui-visibility.json active_profile on the
 * backend:
 *   publico → "public"  (anonymous chat surface, no owner login)
 *   admin   → "admin"   (full SaaS admin tooling visible in the sidebar)
 *   cliente → "tenant"  (regular paying customer; default)
 *
 * The full visibility matrix lives in the workspace's ui-visibility.json.
 * This field only picks which preset that file's active_profile is set to.
 */
export type TenantType = "publico" | "admin" | "cliente"

/**
 * RosterEntry describes one agent slot defined by a tenant type. The backend
 * serialises these as JSON objects inside tenant_types.roster. Legacy data may
 * be a string array — always guard with typeof checks before rendering.
 */
export interface RosterEntry {
  id: string
  role: "master" | "atendente" | "especialista" | "discovery"
  label: string
  desc: string
  locked?: boolean
}

/**
 * TenantTypeCatalogEntry mirrors the controlplane tenant_types catalog row
 * (internal/saas/api/tenant_types.go::tenantTypeResponse). The v2.0 create
 * wizard fetches selectable entries to offer business verticals (clinica,
 * loja, …) beyond the three system types.
 */
export interface TenantTypeCatalogEntry {
  slug: string
  display_name: string
  description: string
  icon: string
  category: string
  ui_profile: string
  is_system: boolean
  is_selectable: boolean
  sort_order: number
  /** Agent roster for this type. May be absent or a legacy string[]. */
  roster?: RosterEntry[]
}

export interface CreateTenantInput {
  display_name: string
  owner_email: string
  subdomain: string
  setup_mode?: "test"
  company_seed?: {
    name?: string
    segment?: string
    summary?: string
    contact_email?: string
    contact_whatsapp?: string
    products_services?: string
    business_hours?: string
    address?: string
    service_regions?: string
    site?: string
    instagram?: string
  }
  selected_agents?: string[]
  whatsapp_test_allowlist?: {
    phones?: string[]
    groups?: string[]
  }
  /**
   * Defaults to "cliente" on the server when omitted. Widened from the
   * 3-union to string so vertical catalog slugs (clinica, loja, …) are
   * accepted; the controlplane resolves any catalog slug. The server now
   * resolves the canonical workspace automatically — no workspace_id needed.
   */
  tenant_type?: string
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

// listTenantTypes fetches the tenant_types catalog through the launcher saas
// proxy (/api/admin/saas → controlplane /api/v1). selectableOnly restricts to
// entries the create wizard should offer.
export async function listTenantTypes(
  selectableOnly = true,
): Promise<TenantTypeCatalogEntry[]> {
  const q = selectableOnly ? "?selectable=true" : ""
  const res = await call<{ tenant_types: TenantTypeCatalogEntry[] }>(
    `/tenant-types${q}`,
  )
  return res.tenant_types ?? []
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
