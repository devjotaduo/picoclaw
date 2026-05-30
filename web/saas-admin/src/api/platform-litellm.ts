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
