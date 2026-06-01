import { describe, expect, it } from "vitest";

import {
  detectPresetFromAPIBase,
  draftLiteLLMModelFromEnv,
  modelWithPrefix,
  normalizeOpenAICompatibleModel,
  parseLLMEnvBlock,
} from "./litellm-admin";

describe("parseLLMEnvBlock", () => {
  it("extracts the LLM env vars used by DashScope compatible-mode", () => {
    const parsed = parseLLMEnvBlock(`
      LLM_API_KEY=sk-test
      LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
      LLM_MODEL=qwen-plus
    `);

    expect(parsed).toEqual({
      apiKey: "sk-test",
      apiBase: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
    });
  });

  it("supports export syntax, quotes, and inline comments", () => {
    const parsed = parseLLMEnvBlock(`
      export OPENAI_API_KEY="sk-test"
      OPENAI_API_BASE='https://example.test/v1' # local proxy
      MODEL="custom-model"
    `);

    expect(parsed).toEqual({
      apiKey: "sk-test",
      apiBase: "https://example.test/v1",
      model: "custom-model",
    });
  });
});

describe("draftLiteLLMModelFromEnv", () => {
  it("builds a LiteLLM draft for DashScope Intl using the OpenAI-compatible model prefix", () => {
    const draft = draftLiteLLMModelFromEnv(`
      LLM_API_KEY=sk-test
      LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
      LLM_MODEL=qwen-plus
    `);

    expect(draft).toMatchObject({
      apiKey: "sk-test",
      apiBase: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      modelName: "qwen-plus",
      providerModel: "openai/qwen-plus",
      provider: "openai",
      providerPreset: "dashscope-intl-openai",
    });
  });

  it("returns null when no supported env vars are present", () => {
    expect(draftLiteLLMModelFromEnv("FOO=bar")).toBeNull();
  });
});

describe("LiteLLM provider helpers", () => {
  it("detects DashScope API bases", () => {
    expect(detectPresetFromAPIBase("https://dashscope-intl.aliyuncs.com/compatible-mode/v1")).toBe(
      "dashscope-intl-openai",
    );
    expect(detectPresetFromAPIBase("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "dashscope-cn-openai",
    );
  });

  it("does not double-prefix provider-qualified models", () => {
    expect(normalizeOpenAICompatibleModel("qwen-plus")).toBe("openai/qwen-plus");
    expect(normalizeOpenAICompatibleModel("openai/qwen-plus")).toBe("openai/qwen-plus");
    expect(modelWithPrefix("qwen-plus", "openai/")).toBe("openai/qwen-plus");
    expect(modelWithPrefix("openrouter/openai/gpt-4o-mini", "openai/")).toBe("openrouter/openai/gpt-4o-mini");
  });
});
