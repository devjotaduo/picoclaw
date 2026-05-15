import { api } from "./client";

export type SkillSummary = {
  name: string;
  description: string;
  emoji?: string;
  active: boolean;
  visible: boolean;
};

export type Skill = SkillSummary & {
  content: string;
};

export async function listSkills(tenantId: string) {
  return api<{ skills: SkillSummary[] }>(`/api/v1/tenants/${tenantId}/skills`);
}

export async function getSkill(tenantId: string, name: string) {
  return api<Skill>(`/api/v1/tenants/${tenantId}/skills/${name}`);
}

export async function saveSkill(tenantId: string, name: string, content: string) {
  return api<void>(`/api/v1/tenants/${tenantId}/skills/${name}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function createSkill(tenantId: string, name: string, description: string) {
  return api<Skill>(`/api/v1/tenants/${tenantId}/skills`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteSkill(tenantId: string, name: string) {
  return api<void>(`/api/v1/tenants/${tenantId}/skills/${name}`, { method: "DELETE" });
}

export async function setSkillActive(tenantId: string, name: string, active: boolean) {
  return api<void>(`/api/v1/tenants/${tenantId}/skills/${name}/active`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

export async function setSkillVisible(tenantId: string, name: string, visible: boolean) {
  return api<void>(`/api/v1/tenants/${tenantId}/skills/${name}/visible`, {
    method: "POST",
    body: JSON.stringify({ visible }),
  });
}

export type AgentTemplate = {
  path: string;
  source: string;
  content: string;
  exists: boolean;
};

export async function getAgent(tenantId: string) {
  return api<AgentTemplate>(`/api/v1/tenants/${tenantId}/agent`);
}

export async function saveAgent(tenantId: string, content: string) {
  return api<void>(`/api/v1/tenants/${tenantId}/agent`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export type AgentInfo = {
  name: string;
  description: string;
  model?: string;
  max_turns?: number;
  tools?: string[];
  skills?: string[];
  mcp_servers?: string[];
};

export async function getAgentInfo(tenantId: string) {
  return api<AgentInfo>(`/api/v1/tenants/${tenantId}/agent/info`);
}

export async function saveAgentInfo(tenantId: string, info: AgentInfo) {
  return api<void>(`/api/v1/tenants/${tenantId}/agent/info`, {
    method: "PUT",
    body: JSON.stringify(info),
  });
}
