import { api } from "./client";

type Access = "none" | "read" | "write";
export type RolePolicy = Record<string, Record<string, Access>>;

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

export async function createLauncherProfile(input: LauncherProfileInput) {
  return api<LauncherProfile>("/api/v1/launcher-profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLauncherProfile(id: string, input: LauncherProfileInput) {
  return api<LauncherProfile>(`/api/v1/launcher-profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteLauncherProfile(id: string) {
  return api<void>(`/api/v1/launcher-profiles/${id}`, { method: "DELETE" });
}

export async function importStandaloneLauncherProfile(id: string) {
  return api<LauncherProfile>(`/api/v1/launcher-profiles/${id}/import-standalone`, {
    method: "POST",
  });
}

export async function getLauncherProfileSeed(id: string) {
  return api<LauncherProfileSeed>(`/api/v1/launcher-profiles/${id}/seed`);
}

export async function updateLauncherProfileSeed(id: string, seed: LauncherProfileSeed) {
  return api<LauncherProfile>(`/api/v1/launcher-profiles/${id}/seed`, {
    method: "PUT",
    body: JSON.stringify(seed),
  });
}
