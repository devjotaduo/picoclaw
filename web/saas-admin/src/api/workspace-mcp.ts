import { api } from "./client";

export type MCPCredentialField = {
  key: string;
  label: string;
  placeholder: string;
  help: string;
  required: boolean;
  secret: boolean;
};

export type MCPCatalogEntry = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  integrations: string[];
  verticals: string[];
  credentials: MCPCredentialField[];
  official: boolean;
  docs_url: string;
  cost_tier: string;
};

export async function listMCPCatalog() {
  return api<{ entries: MCPCatalogEntry[] }>("/api/v1/mcp/catalog");
}

export type MCPActivation = {
  catalog_id: string;
  enabled: boolean;
  credentials_masked: Record<string, boolean>;
  updated_at: string;
};

export async function listWorkspaceMCP(workspaceId: string) {
  return api<{ servers: MCPActivation[] }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp`,
  );
}

export async function putWorkspaceMCP(
  workspaceId: string,
  catalogId: string,
  body: { enabled: boolean; credentials: Record<string, string> },
) {
  return api<{ ok: boolean }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp/${encodeURIComponent(catalogId)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function deleteWorkspaceMCP(workspaceId: string, catalogId: string) {
  return api<void>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp/${encodeURIComponent(catalogId)}`,
    { method: "DELETE" },
  );
}
