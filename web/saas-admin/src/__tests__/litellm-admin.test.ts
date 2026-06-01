import { describe, expect, it } from "vitest";

import {
  buildPlatformLiteLLMModelInput,
  modelWithPrefix,
  normalizeLiteLLMModel,
  normalizeLiteLLMProvider,
} from "@/lib/litellm-admin";

describe("LiteLLM admin helpers", () => {
  it("builds a Gemini payload from a short model id", () => {
    const input = buildPlatformLiteLLMModelInput({
      modelName: "",
      providerModel: " gemini-3.1-pro-preview ",
      provider: "google",
      apiBase: "",
      apiVersion: "",
      apiKey: " os.environ/GEMINI_API_KEY ",
    });

    expect(input).toEqual({
      model_name: "gemini-3.1-pro-preview",
      model: "gemini/gemini-3.1-pro-preview",
      custom_llm_provider: "gemini",
      api_base: undefined,
      api_version: undefined,
      api_key: "os.environ/GEMINI_API_KEY",
    });
  });

  it("keeps OpenRouter model names intact", () => {
    const input = buildPlatformLiteLLMModelInput({
      modelName: "openrouter-gemini",
      providerModel: "openrouter/google/gemini-2.5-pro",
      provider: "openrouter",
      apiBase: "",
      apiVersion: "",
      apiKey: "sk-or",
    });

    expect(input.model).toBe("openrouter/google/gemini-2.5-pro");
    expect(input.custom_llm_provider).toBe("openrouter");
  });

  it("infers known providers from prefixed models", () => {
    expect(normalizeLiteLLMProvider("", "gemini/gemini-3.1-pro-preview")).toBe("gemini");
    expect(normalizeLiteLLMProvider("", "anthropic/claude-sonnet-4-5")).toBe("anthropic");
    expect(normalizeLiteLLMProvider("", "openrouter/google/gemini-2.5-pro")).toBe("openrouter");
  });

  it("only prefixes Gemini models when the provider is Gemini", () => {
    expect(normalizeLiteLLMModel("gemini-3.1-pro-preview", "gemini")).toBe(
      "gemini/gemini-3.1-pro-preview",
    );
    expect(normalizeLiteLLMModel("google/gemini-2.5-pro", "openrouter")).toBe("google/gemini-2.5-pro");
  });

  it("applies provider prefixes without double-prefixing", () => {
    expect(modelWithPrefix("qwen-plus", "openai/")).toBe("openai/qwen-plus");
    expect(modelWithPrefix("openai/qwen-plus", "openai/")).toBe("openai/qwen-plus");
  });
});
