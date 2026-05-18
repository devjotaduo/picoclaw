import { api } from "./client";

export type IntegrationFieldType =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "secret";

export type IntegrationFieldOption = {
  value: string;
  label: string;
};

export type IntegrationField = {
  key: string;
  label: string;
  type: IntegrationFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: IntegrationFieldOption[];
};

export type IntegrationStatus = "configured" | "pending" | "schema_invalid";

export type SkillIntegration = {
  skill_name: string;
  title: string;
  description?: string;
  active: boolean;
  configured: boolean;
  status: IntegrationStatus;
  missing_fields?: string[];
  schema_error?: string;
  fields?: IntegrationField[];
  values: Record<string, unknown>;
  secrets: Record<string, boolean>;
};

export type UpdateIntegrationInput = {
  values: Record<string, unknown>;
  secrets: Record<string, string>;
  clear_secrets: string[];
};

export async function listIntegrations(tenantId: string) {
  return api<{ integrations: SkillIntegration[] }>(`/api/v1/tenants/${tenantId}/integrations`);
}

export async function getIntegration(tenantId: string, skillName: string) {
  return api<SkillIntegration>(`/api/v1/tenants/${tenantId}/integrations/${skillName}`);
}

export async function updateIntegration(
  tenantId: string,
  skillName: string,
  input: UpdateIntegrationInput,
) {
  return api<SkillIntegration>(`/api/v1/tenants/${tenantId}/integrations/${skillName}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
