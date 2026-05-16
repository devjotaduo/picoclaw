import { api } from "./client";

export type TenantStatus = "provisioning" | "active" | "suspended" | "deleting" | "error";

export type Tenant = {
  id: string;
  display_name: string;
  owner_email: string;
  subdomain: string;
  status: TenantStatus;
  container_id: string | null;
  mem_limit_mb: number;
  cpu_quota: number;
  monthly_budget_usd: number | null;
  initial_password_delivered: boolean;
  last_error: string | null;
  created_at: string;
  suspended_at: string | null;
  crm_contact_id?: number | null;
  crm_company_id?: number | null;
  crm_deal_id?: number | null;
  launcher_profile_id?: string | null;
  launcher_profile_version_applied?: number | null;
};

export type CreateTenantInput = {
  display_name: string;
  owner_email: string;
  subdomain: string;
  monthly_budget_usd?: number;
  mem_limit_mb?: number;
  cpu_quota?: number;
  launcher_profile_id?: string;
};

export type CreateTenantResponse = {
  tenant_id: string;
  url: string;
  initial_password: string;
  owner_invite_token?: string;
  warning: string;
};

export type UsageSummary = {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  records: number;
};

export type UsageRecord = {
  ID: number;
  TenantID: string;
  Timestamp: string;
  Provider: string;
  Model: string;
  PromptTokens: number;
  CompletionTokens: number;
  CostUSD: number;
};

export type UsageResponse = {
  from: string;
  to: string;
  summary: UsageSummary;
  recent: UsageRecord[];
};

export async function listTenants() {
  return api<{ tenants: Tenant[] }>("/api/v1/tenants");
}

export async function getTenant(id: string) {
  return api<Tenant>(`/api/v1/tenants/${id}`);
}

export async function createTenant(input: CreateTenantInput) {
  return api<CreateTenantResponse>("/api/v1/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function suspendTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}/suspend`, { method: "POST" });
}

export async function resumeTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}/resume`, { method: "POST" });
}

export async function restartTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}/restart`, { method: "POST" });
}

export async function applyLauncherProfile(id: string, launcherProfileId: string) {
  return api<{ ok: boolean; backup_dir: string }>(`/api/v1/tenants/${id}/apply-profile`, {
    method: "POST",
    body: JSON.stringify({ launcher_profile_id: launcherProfileId }),
  });
}

export async function deleteTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}`, { method: "DELETE" });
}

export async function rotatePassword(id: string) {
  return api<{ initial_password: string; warning: string }>(
    `/api/v1/tenants/${id}/rotate-password`,
    { method: "POST" },
  );
}

export async function markPasswordDelivered(id: string) {
  return api<void>(`/api/v1/tenants/${id}/mark-delivered`, { method: "POST" });
}

export async function setCRMLinks(
  id: string,
  links: { contact_id?: number | null; company_id?: number | null; deal_id?: number | null },
) {
  return api<{ ok: boolean }>(`/api/v1/tenants/${id}/crm`, {
    method: "PUT",
    body: JSON.stringify(links),
  });
}

export type TenantMembership = {
  user_id: number;
  tenant_id: string;
  role: string;
  created_at: string;
  email: string;
};

export async function listMembers(id: string) {
  return api<{ members: TenantMembership[] }>(`/api/v1/tenants/${id}/members`);
}

export async function createInvite(id: string, email: string, role: string) {
  return api<{ token: string; expires_at: string }>(`/api/v1/tenants/${id}/invites`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function listInvites(id: string) {
  return api<{ invites: { id: number; email: string; role: string; expires_at: string; accepted_at: string | null }[] }>(
    `/api/v1/tenants/${id}/invites`,
  );
}

export async function revokeInvite(tenantId: string, inviteId: number) {
  return api<void>(`/api/v1/tenants/${tenantId}/invites/${inviteId}`, { method: "DELETE" });
}

export async function getTenantLogs(id: string, tail = 200) {
  return api<{ lines: string[] }>(`/api/v1/tenants/${id}/logs?tail=${tail}`);
}

export async function getUsage(id: string, from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  q.set("limit", "100");
  return api<UsageResponse>(`/api/v1/tenants/${id}/usage?${q.toString()}`);
}
