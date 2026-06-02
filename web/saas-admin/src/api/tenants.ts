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
  // supabase_user_id is set when the tenant's dashboard login is backed
  // by Supabase Auth (as opposed to the legacy local sessions table).
  // The "Reenviar credenciais" admin action depends on this being non-null.
  supabase_user_id?: string | null;
  // auth_backend ("local" | "supabase") + is_public determine which
  // controlplane auth path the tenant uses and whether the launcher
  // runs in trusted_gateway or local mode. Surfaced for the tenant
  // list so operators can spot mismatches at a glance.
  auth_backend: "local" | "supabase";
  is_public: boolean;
};

// TenantType drives the UI visibility profile written into the tenant volume:
//   "publico" → active_profile=public  → no owner password, anonymous chat
//   "admin"   → active_profile=admin   → full SaaS admin sidebar
//   "cliente" → active_profile=tenant  → owner dashboard, no admin tools (default)
// Maps in internal/saas/api/tenants.go::resolveUIProfile.
export type TenantType = "publico" | "admin" | "cliente";

// TenantTypeCatalogEntry mirrors the controlplane tenant_types catalog row
// (internal/saas/api/tenant_types.go::tenantTypeResponse). The v2.0 create
// wizard fetches selectable entries to offer business verticals (clinica,
// loja, …) on top of the three system types.
// RosterEntry is one agent spec in a tenant type's roster (object form, v2.0).
// Legacy catalog rows may still carry a flat string[]; render defensively.
export type RosterEntry = {
  id: string;
  role: "master" | "atendente" | "especialista" | "discovery";
  label: string;
  desc: string;
  locked?: boolean;
};
export type TenantTypeCatalogEntry = {
  slug: string;
  display_name: string;
  description: string;
  icon: string;
  category: string;
  ui_profile: string;
  // roster: the named agents this type is born with, each with a description.
  // May be absent or a legacy string[] on rows seeded before migration 0022.
  roster?: RosterEntry[];
  is_system: boolean;
  is_selectable: boolean;
  sort_order: number;
};
export type TenantModelRoutingMode = "auto" | "litellm" | "cli";
export type TenantCLIProvider = "claude-cli" | "codex-cli";

export type TenantModelRoutingInput = {
  mode: TenantModelRoutingMode;
  litellm?: {
    model_name?: string;
    api_base?: string;
    fallbacks?: string[];
    allowed_models?: string[];
  };
  cli?: {
    order?: TenantCLIProvider[];
    claude_model_name?: string;
    claude_model?: string;
    codex_model_name?: string;
    codex_model?: string;
  };
};

export type CreateTenantInput = {
  display_name: string;
  owner_email: string;
  subdomain: string;
  setup_mode?: "test";
  company_seed?: {
    name?: string;
    segment?: string;
    summary?: string;
    contact_email?: string;
    contact_whatsapp?: string;
    products_services?: string;
    business_hours?: string;
    address?: string;
    service_regions?: string;
    site?: string;
    instagram?: string;
  };
  selected_agents?: string[];
  whatsapp_test_allowlist?: {
    phones?: string[];
    groups?: string[];
  };
  // tenant_type is optional for backwards compat — controlplane defaults to
  // "cliente" when missing. New tenants from this UI always send it. Widened
  // from the 3-union to string so vertical slugs from the tenant_types catalog
  // (clinica, loja, …) are accepted; the controlplane resolves any catalog slug.
  tenant_type?: string;
  monthly_budget_usd?: number;
  mem_limit_mb?: number;
  cpu_quota?: number;
  // workspace_id is optional: the controlplane resolves the canonical
  // is_default_auto workspace when the wizard omits it. The type-driven wizard
  // no longer asks the operator to pick one.
  workspace_id?: string;
  // model_routing lets the SaaS admin decide whether the materialized tenant
  // uses LiteLLM virtual-key routing or shared Claude/Codex CLI auth, plus
  // the ordered fallback chain.
  model_routing?: TenantModelRoutingInput;
};

export type CreateTenantResponse = {
  tenant_id: string;
  url: string;
  access_link?: string;
  magic_link?: string;
  short_magic_link?: string;
  magic_link_expires_at?: string;
  magic_link_role?: MagicLinkRole;
  access_warning?: string;
  initial_password?: string;
  supabase_user_id?: string;
  owner_invite_token?: string;
  warning?: string;
  info?: string;
};

export type TenantReadiness = {
  tenant_id: string;
  url: string;
  status: TenantStatus;
  ready: boolean;
  subdomain_ready: boolean;
  http_status?: number;
  error?: string;
  last_error?: string | null;
  checked_at: string;
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

// listTenantTypes fetches the tenant_types catalog. selectableOnly restricts to
// entries the create wizard should offer (excludes internal/automation types).
export async function listTenantTypes(selectableOnly = true) {
  const q = selectableOnly ? "?selectable=true" : "";
  return api<{ tenant_types: TenantTypeCatalogEntry[] }>(`/api/v1/tenant-types${q}`);
}

export async function getTenant(id: string) {
  return api<Tenant>(`/api/v1/tenants/${id}`);
}

export async function getTenantReadiness(id: string) {
  return api<TenantReadiness>(`/api/v1/tenants/${encodeURIComponent(id)}/readiness`);
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

// PromoteTenantInput — body for POST /api/v1/tenants/{id}/promote.
// All fields optional: handler reads owner_email from workspace state
// (Sofia's capture) by default. Force bypasses the promotion.ready
// gate for tenants where the onboarding state machine never ran.
export type PromoteTenantInput = {
  force?: boolean;
  owner_email?: string;
  force_reason?: string;
};

export type PromoteTenantResponse = {
  tenant_id: string;
  url: string;
  owner_email: string;
  initial_password: string;
  login_mode: "password";
  info?: string;
  warning?: string;
  force_reason?: string;
};

// promoteTenant migrates a public tenant to a regular cliente: creates
// the owner user, generates a password, flips ui-visibility to "tenant",
// and recreates the container with PICOCLAW_AUTH_MODE=launcher. Sends
// the credentials email when SMTP is configured.
export async function promoteTenant(id: string, input: PromoteTenantInput = {}) {
  return api<PromoteTenantResponse>(`/api/v1/tenants/${id}/promote`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// OnboardingState mirrors workspace/state/onboarding.json produced by
// the onboarding-state skill (Sofia + Catarina write to it; backend
// promote reads it). Used by the admin panel to show "Aguardando
// promoção" badge and to pre-fill owner_email in the promote modal.
export type OnboardingState = {
  phase:
    | "discovery_in_progress"
    | "discovery_done"
    | "deepening_in_progress"
    | "ready_for_promotion"
    | "promoted";
  discovery: {
    started_at: string | null;
    completed_at: string | null;
    segment: string | null;
    summary: string | null;
    agent: string;
  };
  deepening: {
    started_at: string | null;
    first_contact_at?: string | null;
    last_outreach_at?: string | null;
    last_owner_response_at?: string | null;
    last_bridge_attempt_at?: string | null;
    last_bridge_failed_at?: string | null;
    last_bridge_error?: string | null;
    areas_covered: string[];
    areas_required: string[];
    completed_at: string | null;
    agent: string;
    forced_completion_reason?: string;
  };
  owner_captured: {
    name: string | null;
    email: string | null;
    whatsapp: string | null;
    captured_by: string | null;
    captured_at: string | null;
  };
  promotion: {
    ready: boolean;
    blocked_by: string[];
    promoted_at: string | null;
    promoted_by: string | null;
  };
};

// getTenantOnboardingState returns the state machine JSON written by
// Sofia/Catarina via the onboarding-state skill. Returns null when the
// tenant hasn't been touched by the skill yet (404 from backend).
export async function getTenantOnboardingState(id: string): Promise<OnboardingState | null> {
  try {
    return await api<OnboardingState>(`/api/v1/tenants/${id}/onboarding-state`);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "status" in e && (e as { status?: number }).status === 404) {
      return null;
    }
    throw e;
  }
}

export async function resumeTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}/resume`, { method: "POST" });
}

export async function restartTenant(id: string) {
  return api<void>(`/api/v1/tenants/${id}/restart`, { method: "POST" });
}

// Recreate stops the tenant container, removes it, and creates a fresh one
// from the current TENANT_IMAGE / provisioner spec. Preserves the
// bind-mounted volume. Needed when the launcher image is rebuilt OR when
// the container's env vars must be refreshed (e.g. PICOCLAW_AUTH_MODE
// flipped after toggling is_public, ALLOWED_CHANNELS updated).
export async function recreateTenant(id: string) {
  return api<void>(`/api/v1/tenants/${encodeURIComponent(id)}/recreate`, {
    method: "POST",
  });
}

export type SyncTenantWorkspaceResponse = {
  tenant_id: string;
  workspace_id: string;
  workspace_version_applied: number;
  files_copied: number;
  dirs_created: number;
  public_agent_applied: boolean;
  state_refreshed: boolean;
  memory_backfilled: boolean;
  warning?: string;
};

export async function syncTenantWorkspace(id: string) {
  return api<SyncTenantWorkspaceResponse>(
    `/api/v1/tenants/${encodeURIComponent(id)}/sync-workspace`,
    { method: "POST" },
  );
}

export type FinishTenantTestModeResponse = {
  tenant_id: string;
  finished: boolean;
  status: {
    status: string;
    in_test: boolean;
    active_profile: string;
    can_finish: boolean;
    blocked_by: string[];
  };
};

export async function finishTenantTestMode(id: string) {
  return api<FinishTenantTestModeResponse>(
    `/api/v1/tenants/${encodeURIComponent(id)}/test-mode/finish`,
    { method: "POST" },
  );
}

export type TenantModelRouting = TenantModelRoutingInput;

export async function getTenantModelRouting(id: string) {
  return api<TenantModelRouting>(`/api/v1/tenants/${encodeURIComponent(id)}/model-routing`);
}

export async function updateTenantModelRouting(id: string, input: TenantModelRoutingInput) {
  return api<TenantModelRouting>(`/api/v1/tenants/${encodeURIComponent(id)}/model-routing`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// Clone provisions a fresh tenant whose home/ subtree is a raw copy of the
// source tenant's volume. All secrets / dashboard password / sessions
// carry over — the new tenant is functionally a twin until the operator
// rotates credentials. A new LiteLLM virtual key is minted server-side.
export type CloneTenantInput = {
  subdomain: string;
  display_name: string;
  owner_email: string;
  monthly_budget_usd?: number;
  mem_limit_mb?: number;
  cpu_quota?: number;
};
export type CloneTenantResult = {
  tenant_id: string;
  url: string;
  source_tenant_id: string;
  owner_invite_token: string;
  sanity_checks: SanityCheck[];
  info: string;
};
export async function cloneTenant(id: string, input: CloneTenantInput) {
  return api<CloneTenantResult>(
    `/api/v1/tenants/${encodeURIComponent(id)}/clone`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export type SanityCheck = {
  name: string;
  status: "ok" | "warn" | "fail";
  message?: string;
};
export type TenantSanity = {
  tenant_id: string;
  sanity_checks: SanityCheck[];
};
export async function getTenantSanity(id: string) {
  return api<TenantSanity>(`/api/v1/tenants/${encodeURIComponent(id)}/sanity`);
}

export type MagicLinkSummary = {
  nonce: string;
  created_at: string;
  expires_at: string;
  consumed_at?: string | null;
  summary?: string | null;
  active: boolean;
};
export async function listTenantMagicLinks(id: string) {
  return api<{ tenant_id: string; links: MagicLinkSummary[] }>(
    `/api/v1/tenants/${encodeURIComponent(id)}/magic-links`,
  );
}

export async function deleteTenant(id: string) {
  return api<void>(`/api/v1/tenants/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function rotatePassword(id: string) {
  return api<{ initial_password: string; warning: string }>(
    `/api/v1/tenants/${id}/rotate-password`,
    { method: "POST" },
  );
}

// resendCredentials rotates the Supabase password to a fresh random value,
// regenerates a magic link, emails the bundle to the owner, AND returns
// the new password + magic link to the admin caller so the UI can show
// them in a "copy here" dialog. This makes the action useful even when
// SMTP is slow / mail lands in spam / the operator wants to forward the
// link by another channel.
export type ResendCredentialsResult = {
  sent_to: string;
  password_rotated: boolean;
  magic_link_in_email: boolean;
  dashboard_url: string;
  initial_password: string;
  magic_link: string;
  // short_magic_link is the /s/<code> wrapper around magic_link, scoped
  // to the apex domain. WhatsApp/SMS-friendly. Empty when shortening
  // failed (the long magic_link still works).
  short_magic_link: string;
  info: string;
};
export async function resendCredentials(id: string) {
  return api<ResendCredentialsResult>(
    `/api/v1/tenants/${encodeURIComponent(id)}/resend-credentials`,
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
  short_magic_link?: string;
  access_link?: string;
  role?: MagicLinkRole;
  warning?: string;
};

// MagicLinkRole values accepted by the controlplane. Empty / undefined =
// "public" (legacy lead-onboarding link). Elevated roles let the admin
// hand out a no-password owner/admin access link — the TTL is capped
// server-side (24h owner, 7d admin) and the controlplane writes an
// audit row.
export type MagicLinkRole = "public" | "tenant_owner" | "tenant_admin";

export async function generateTenantMagicLink(
  id: string,
  ttlSeconds?: number,
  role?: MagicLinkRole,
) {
  return api<MagicLink>(`/api/v1/tenants/${encodeURIComponent(id)}/magic-link`, {
    method: "POST",
    body: JSON.stringify({ ttl_seconds: ttlSeconds ?? 0, role: role ?? "" }),
  });
}

// Manually mark a magic link as consumed. Visitors clicking the link
// afterwards see the friendly thank-you page with the optional summary
// text instead of the dashboard.
export async function consumeMagicLink(nonce: string, summary?: string) {
  return api<void>(`/api/v1/magic-links/${encodeURIComponent(nonce)}/consume`, {
    method: "POST",
    body: JSON.stringify({ summary: summary ?? "" }),
  });
}
