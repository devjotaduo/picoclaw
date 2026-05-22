import { api } from "./client";

// Workspaces API client. Mirrors the shape returned by the controlplane's
// internal/saas/api/workspaces.go endpoints.

export type Access = "none" | "read" | "write";
export type RolePolicy = Record<string, Record<string, Access>>;

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description: string;
  host_path: string;
  is_default_auto: boolean;
  is_available_manual: boolean;
  role_policy: RolePolicy;
  frontend_built_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceInput = {
  name: string;
  slug?: string;
  description?: string;
  is_default_auto?: boolean;
  is_available_manual?: boolean;
  role_policy?: RolePolicy;
};

export type WorkspaceFile = {
  path: string;
  content: string;
  size: number;
  mode: string;
};

export type WorkspaceBuildResult = {
  ok: boolean;
  built_at: string;
  log_tail: string;
  error?: string;
};

export type WorkspaceImportFromHomeInput = {
  name: string;
  slug?: string;
  description?: string;
  source_path?: string;
};

export async function listWorkspaces(opts?: { manualOnly?: boolean }) {
  const qs = opts?.manualOnly ? "?manual_only=true" : "";
  return api<{ workspaces: Workspace[] }>(`/api/v1/workspaces${qs}`);
}

export async function getWorkspace(id: string) {
  return api<Workspace>(`/api/v1/workspaces/${encodeURIComponent(id)}`);
}

export async function createWorkspace(input: WorkspaceInput) {
  return api<Workspace>("/api/v1/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateWorkspace(id: string, input: WorkspaceInput) {
  return api<Workspace>(`/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteWorkspace(id: string) {
  return api<void>(`/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type WorkspaceTreeEntry = {
  path: string;
  is_dir: boolean;
  size: number;
  is_text: boolean;
};

export type WorkspaceTree = {
  workspace_id: string;
  subtrees: string[];
  entries: WorkspaceTreeEntry[];
  truncated?: boolean;
};

export async function listWorkspaceFiles(id: string) {
  return api<WorkspaceTree>(`/api/v1/workspaces/${encodeURIComponent(id)}/files/tree`);
}

export async function readWorkspaceFile(id: string, path: string) {
  return api<WorkspaceFile>(
    `/api/v1/workspaces/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`,
  );
}

export async function writeWorkspaceFile(id: string, path: string, content: string) {
  return api<void>(`/api/v1/workspaces/${encodeURIComponent(id)}/files`, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
}

export async function buildWorkspaceFrontend(id: string) {
  return api<WorkspaceBuildResult>(
    `/api/v1/workspaces/${encodeURIComponent(id)}/frontend/build`,
    { method: "POST" },
  );
}

export async function importWorkspaceFromHome(input: WorkspaceImportFromHomeInput) {
  return api<Workspace>("/api/v1/workspaces/import-from-home", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
