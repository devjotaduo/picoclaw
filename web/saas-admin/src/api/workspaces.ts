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
  // When true the provisioner copies the workspace home verbatim and skips
  // its post-copy steps (password seeding, LiteLLM key + placeholder
  // substitution, launcher policy override). The operator owns the boot
  // state — useful when re-bundling an existing tenant volume.
  is_raw: boolean;
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
  is_raw?: boolean;
  role_policy?: RolePolicy;
  // Default true. Set false only when caller will SSH-edit or upload home/
  // content manually before any tenant provisions from this workspace.
  // Ignored when clone_from_slug is set.
  seed_from_baseline?: boolean;
  // Set to slug of an existing workspace to clone home/ from it instead of
  // seeding from the embedded baseline. Use for "duplicate this template"
  // workflows (e.g. clone "default-business" → "saude-clinica").
  clone_from_slug?: string;
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

// ── Validate workspace ──────────────────────────────────────────────
// Checks every required + recommended file exists in home/. Backend
// returns ok=true only when EVERY required file is present.

export type WorkspaceValidationRow = {
  path: string;
  required: boolean;
  present: boolean;
  description: string;
};

export type WorkspaceValidation = {
  workspace_id: string;
  ok: boolean;
  rows: WorkspaceValidationRow[];
};

export async function validateWorkspace(id: string) {
  return api<WorkspaceValidation>(`/api/v1/workspaces/${encodeURIComponent(id)}/validate`);
}

// ── Upload workspace ─────────────────────────────────────────────────
// Operator uploads a zip containing one or more of the workspace's
// three subdirs: home/ (the bind-mounted tenant container content),
// frontend-src/ (editable React source), frontend-dist/ (compiled vite
// bundle bind-mounted read-only into the tenant). Backend validates
// (size cap, path traversal, runtime files skipped, zip-bomb defence)
// before writing anything to disk.
//
// Three layouts auto-detected by the backend:
//   (a) home/config.json, home/workspace/AGENT.md ...
//       → everything lands at <ws>/home/...
//   (b) config.json, workspace/AGENT.md ...
//       → no prefix; backend assumes it's a home/ payload and lands
//         everything at <ws>/home/...
//   (c) home/config.json, frontend-src/package.json,
//       frontend-dist/index.html ...
//       → each top-level dir routes to its matching subdir on the
//         workspace. Any subset of the three is accepted.

export async function uploadWorkspace(input: {
  name: string;
  slug?: string;
  description?: string;
  is_default_auto?: boolean;
  is_available_manual?: boolean;
  is_raw?: boolean;
  archive: File;
}) {
  const fd = new FormData();
  fd.set("name", input.name);
  if (input.slug) fd.set("slug", input.slug);
  if (input.description) fd.set("description", input.description);
  if (input.is_default_auto !== undefined) fd.set("is_default_auto", String(input.is_default_auto));
  if (input.is_available_manual !== undefined) fd.set("is_available_manual", String(input.is_available_manual));
  if (input.is_raw !== undefined) fd.set("is_raw", String(input.is_raw));
  fd.set("archive", input.archive);

  // Note: don't set Content-Type header — the browser adds the boundary
  // automatically when the body is a FormData.
  const r = await fetch("/api/v1/workspaces/upload", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  // Response shape changed: backend now returns { workspace, validation }
  // when home/config.json was parsed. We accept either shape so this client
  // keeps working against the old endpoint during rollout. The new shape
  // surfaces warnings (yellow badge in the UI) without blocking the upload.
  const body = (await r.json()) as
    | Workspace
    | { workspace: Workspace; validation?: WorkspaceValidationReport };
  if ("workspace" in body) {
    return { workspace: body.workspace, validation: body.validation };
  }
  return { workspace: body, validation: undefined };
}

export type WorkspaceValidationReport = {
  warnings: string[];
  config_checksum?: string;
};
