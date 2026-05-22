import { api } from "./client";

export type MCPCredentialField = {
  key: string;
  label: string;
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
