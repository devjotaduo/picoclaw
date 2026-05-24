// Discovery-mode liberation API. Mirrors admin_tenants_discovery.go.
//
// A freshly-provisioned tenant lives in "discovery" mode (ui-visibility.json
// active_profile="public") until the admin confirms its workspace passes
// validate_workspace.py. The Liberate button flips active_profile to "tenant"
// so the full feature set becomes visible to the tenant.

import { api } from "./client";

export type DiscoveryCheck = {
  key: string;
  label: string;
  present: boolean;
  note?: string;
};

export type DiscoveryIntegracao = {
  key: string;
  label: string;
  status: "pending" | "resolved" | "skipped";
  note?: string;
};

export type DiscoveryStatus = {
  tenant_id: string;
  ok: boolean;
  universal: DiscoveryCheck[];
  segmento_key?: string;
  segmento_checks?: DiscoveryCheck[];
  integracoes_required: DiscoveryIntegracao[];
  missing_summary: string[];
  // script_used=false signals the backend fell back to its in-process stub
  // because validate_workspace.py isn't installed yet. The Liberate button
  // is always disabled in that case.
  script_used: boolean;
  // active_profile is the current ui-visibility.json value. "public" while
  // in discovery, "tenant" after liberation.
  active_profile: "public" | "tenant";
  raw?: Record<string, unknown>;
};

export type LiberateResult =
  | { tenant_id: string; liberated: true; active_profile: "tenant" }
  | {
      tenant_id: string;
      liberated: false;
      reason: string;
      missing_summary: string[];
      universal: DiscoveryCheck[];
      segmento_checks?: DiscoveryCheck[];
      integracoes_required: DiscoveryIntegracao[];
    };

export async function getDiscoveryStatus(
  id: string,
  opts?: { markResolved?: string[] },
) {
  const qs = opts?.markResolved?.length
    ? `?mark_resolved=${encodeURIComponent(opts.markResolved.join(","))}`
    : "";
  return api<DiscoveryStatus>(
    `/api/v1/admin/tenants/${encodeURIComponent(id)}/discovery-status${qs}`,
  );
}

export async function liberateTenant(id: string) {
  return api<LiberateResult>(
    `/api/v1/admin/tenants/${encodeURIComponent(id)}/discovery-liberate`,
    { method: "POST" },
  );
}
