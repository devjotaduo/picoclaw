import { api } from "./client";

export type PlatformLiteLLMConfig = {
  url: string;
  configured: boolean;
  url_source: "database" | "env" | "none";
  master_key_configured: boolean;
  master_key_source: "database" | "env" | "none";
  encryption_configured: boolean;
};

export type PlatformLiteLLMInput = {
  url: string;
  master_key?: string;
};

export type PlatformLiteLLMModel = {
  id: string;
  model_name: string;
  model: string;
  provider: string;
  mode?: string;
  api_base_configured: boolean;
  api_key_configured: boolean;
  db_model: boolean;
};

export type PlatformLiteLLMModelInput = {
  model_name: string;
  model: string;
  api_key?: string;
  api_base?: string;
  api_version?: string;
  custom_llm_provider?: string;
  rpm?: number;
  tpm?: number;
};

export async function getPlatformLiteLLM() {
  return api<PlatformLiteLLMConfig>("/api/v1/platform/litellm");
}

export async function updatePlatformLiteLLM(input: PlatformLiteLLMInput) {
  return api<PlatformLiteLLMConfig>("/api/v1/platform/litellm", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function testPlatformLiteLLM() {
  return api<{ ok: boolean }>("/api/v1/platform/litellm/test", { method: "POST" });
}

export async function listPlatformLiteLLMModels() {
  return api<{ models: PlatformLiteLLMModel[] }>("/api/v1/platform/litellm/models");
}

export async function createPlatformLiteLLMModel(input: PlatformLiteLLMModelInput) {
  return api<{ ok: boolean }>("/api/v1/platform/litellm/models", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deletePlatformLiteLLMModel(id: string) {
  return api<void>(`/api/v1/platform/litellm/models/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
