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
  workspace_id?: string | null;
  workspace_version_applied?: number | null;
};

export type CreateTenantInput = {
  display_name: string;
  owner_email: string;
  subdomain: string;
  monthly_budget_usd?: number;
  mem_limit_mb?: number;
  cpu_quota?: number;
  // workspace_id is required: it selects the Workspace whose home/ subtree
  // seeds the tenant volume and whose frontend-dist/ is bind-mounted.
  workspace_id: string;
};

export type CreateTenantResponse = {
  tenant_id: string;
  url: string;
  magic_link?: string;
  initial_password?: string;
  supabase_user_id?: string;
  owner_invite_token?: string;
  warning?: string;
  info?: string;
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

// ── Tenant files editor ─────────────────────────────────────────────
// Inline editor for AGENT.md, SOUL.md, behavior.json, memory/*.md, etc.
// inside a tenant's live bind-mounted volume. Mirrors the workspaces
// files API but with a tighter hidden-files filter (runtime state, secrets,
// provisioner-managed paths are never exposed).

export type TenantFileTreeEntry = {
  path: string;
  is_dir: boolean;
  size: number;
  is_text: boolean;
};

export type TenantFileTree = {
  tenant_id: string;
  root: string;
  entries: TenantFileTreeEntry[];
  truncated?: boolean;
};

export type TenantFile = {
  path: string;
  size: number;
  mode: string;
  content: string;
};

export async function listTenantFiles(id: string) {
  return api<TenantFileTree>(`/api/v1/tenants/${encodeURIComponent(id)}/files/tree`);
}

export async function readTenantFile(id: string, path: string) {
  return api<TenantFile>(
    `/api/v1/tenants/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`,
  );
}

export async function writeTenantFile(id: string, path: string, content: string) {
  return api<TenantFile>(`/api/v1/tenants/${encodeURIComponent(id)}/files`, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
}

// ── Magic link ─────────────────────────────────────────────
// Operator-generated URL that lets a prospect/lead click and land
// directly inside the tenant's dashboard chatting with the agent — no
// password, no Supabase login. Used by the onboarding tenant funnel.
//
// Token is HMAC-signed by the controlplane with the gateway shared
// secret. Setting MaxAge via the consumption endpoint sets a per-tenant
// HttpOnly cookie so subsequent navigation works without keeping the
// token in the URL bar.

export type MagicLink = {
  url: string;
  token: string;
  expires_at: string;
};

export async function generateTenantMagicLink(id: string, ttlSeconds?: number) {
  return api<MagicLink>(`/api/v1/tenants/${encodeURIComponent(id)}/magic-link`, {
    method: "POST",
    body: JSON.stringify({ ttl_seconds: ttlSeconds ?? 0 }),
  });
}
