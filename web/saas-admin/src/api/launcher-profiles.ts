import { api } from "./client";

export type Access = "none" | "read" | "write";
export type RolePolicy = Record<string, Record<string, Access>>;

export type PolicyRole = {
  id: string;
  label: string;
  description: string;
};

export type PolicyAccessLevel = {
  id: Access;
  label: string;
  description: string;
};

export type PolicyFeatureGroup = {
  id: string;
  label: string;
  description: string;
};

export type PolicyFeature = {
  id: string;
  label: string;
  description: string;
  group: string;
  fallback?: string;
};

export type LauncherPolicyCatalog = {
  roles: PolicyRole[];
  access_levels: PolicyAccessLevel[];
  groups: PolicyFeatureGroup[];
  features: PolicyFeature[];
  default_role_policy: RolePolicy;
};

export type LauncherProfile = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_default: boolean;
  version: number;
  seed_path: string;
  role_policy: RolePolicy;
  created_at: string;
  updated_at: string;
};

export type LauncherProfileSeed = {
  config_json?: unknown;
  agent_md?: string;
  soul_md?: string;
  behavior_json?: unknown;
};

export type LauncherProfileSeedFile = {
  path: string;
  size: number;
  sensitive: boolean;
  exact: boolean;
  updated_at: string;
};

type LauncherProfileInput = {
  name: string;
  slug?: string;
  description?: string;
  is_default?: boolean;
  role_policy?: RolePolicy;
};

export async function listLauncherProfiles() {
  return api<{ profiles: LauncherProfile[] }>("/api/v1/launcher-profiles");
}

export async function getLauncherPolicyCatalog() {
  return api<LauncherPolicyCatalog>("/api/v1/launcher-policy/catalog");
}

export async function createLauncherProfile(input: LauncherProfileInput) {
  return api<LauncherProfile>("/api/v1/launcher-profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLauncherProfile(
  id: string,
  input: LauncherProfileInput,
) {
  return api<LauncherProfile>(`/api/v1/launcher-profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteLauncherProfile(id: string) {
  return api<void>(`/api/v1/launcher-profiles/${id}`, { method: "DELETE" });
}

export async function importStandaloneLauncherProfile(id: string) {
  return api<LauncherProfile>(
    `/api/v1/launcher-profiles/${id}/import-standalone`,
    {
      method: "POST",
    },
  );
}

export async function getLauncherProfileSeed(id: string) {
  return api<LauncherProfileSeed>(`/api/v1/launcher-profiles/${id}/seed`);
}

export async function updateLauncherProfileSeed(
  id: string,
  seed: LauncherProfileSeed,
) {
  return api<LauncherProfile>(`/api/v1/launcher-profiles/${id}/seed`, {
    method: "PUT",
    body: JSON.stringify(seed),
  });
}

export async function listLauncherProfileSeedFiles(id: string) {
  return api<{ files: LauncherProfileSeedFile[] }>(
    `/api/v1/launcher-profiles/${id}/seed/files`,
  );
}

export async function uploadLauncherProfileSeedFile(input: {
  id: string;
  path: string;
  file: File;
  confirmSensitive: boolean;
}) {
  const form = new FormData();
  form.set("path", input.path);
  form.set("confirm_sensitive", String(input.confirmSensitive));
  form.set("file", input.file);
  const resp = await fetch(`/api/v1/launcher-profiles/${input.id}/seed/files`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw { error: body.error ?? `HTTP ${resp.status}`, status: resp.status, body };
  }
  return body as LauncherProfileSeedFile;
}

export async function deleteLauncherProfileSeedFile(id: string, path: string) {
  return api<void>(
    `/api/v1/launcher-profiles/${id}/seed/files?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );
}
