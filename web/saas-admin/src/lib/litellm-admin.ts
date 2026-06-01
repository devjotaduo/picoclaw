import type { PlatformLiteLLMModelInput } from "@/api/platform-litellm";

export type LiteLLMProviderPreset = {
  value: string;
  label: string;
  llmProvider: string;
  apiBase: string;
  modelPrefix?: string;
  defaultModel?: string;
};

// These presets configure LiteLLM, not the tenant-side PicoClaw provider
// registry. DashScope's compatible-mode endpoint is OpenAI-compatible, so the
// proxy model must use the openai/ prefix while api_base points to DashScope.
export const LITELLM_PROVIDER_PRESETS: LiteLLMProviderPreset[] = [
  { value: "anthropic", label: "Anthropic", llmProvider: "anthropic", apiBase: "" },
  { value: "openai", label: "OpenAI", llmProvider: "openai", apiBase: "" },
  {
    value: "dashscope-intl-openai",
    label: "DashScope Intl (Qwen)",
    llmProvider: "openai",
    apiBase: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    modelPrefix: "openai/",
    defaultModel: "qwen-plus",
  },
  {
    value: "dashscope-cn-openai",
    label: "DashScope China (Qwen)",
    llmProvider: "openai",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelPrefix: "openai/",
    defaultModel: "qwen-plus",
  },
  { value: "openrouter", label: "OpenRouter", llmProvider: "openrouter", apiBase: "https://openrouter.ai/api/v1" },
  {
    value: "gemini",
    label: "Google Gemini",
    llmProvider: "gemini",
    apiBase: "",
    modelPrefix: "gemini/",
    defaultModel: "gemini-3.1-pro-preview",
  },
  { value: "groq", label: "Groq", llmProvider: "groq", apiBase: "https://api.groq.com/openai/v1" },
  { value: "mistral", label: "Mistral", llmProvider: "mistral", apiBase: "https://api.mistral.ai/v1" },
  { value: "deepseek", label: "DeepSeek", llmProvider: "deepseek", apiBase: "https://api.deepseek.com" },
  { value: "xai", label: "xAI (Grok)", llmProvider: "xai", apiBase: "https://api.x.ai/v1" },
  { value: "together_ai", label: "Together AI", llmProvider: "together_ai", apiBase: "https://api.together.xyz/v1" },
  { value: "azure", label: "Azure OpenAI", llmProvider: "azure", apiBase: "" },
  { value: "ollama", label: "Ollama (local)", llmProvider: "ollama", apiBase: "http://localhost:11434" },
];

export type ParsedLLMEnv = {
  apiKey?: string;
  apiBase?: string;
  model?: string;
};

export type LiteLLMEnvModelDraft = {
  apiKey?: string;
  apiBase?: string;
  modelName?: string;
  providerModel?: string;
  provider: string;
  providerPreset: string;
};

export type LiteLLMModelDraft = {
  modelName: string;
  providerModel: string;
  provider: string;
  apiBase: string;
  apiVersion: string;
  apiKey: string;
};

export function parseLLMEnvBlock(raw: string): ParsedLLMEnv {
  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1].toUpperCase();
    let value = stripInlineComment(match[2].trim());
    value = stripOptionalQuotes(value.trim());
    if (value) values.set(key, value);
  }

  return {
    apiKey: firstValue(values, ["LLM_API_KEY", "DASHSCOPE_API_KEY", "OPENAI_API_KEY"]),
    apiBase: firstValue(values, ["LLM_BASE_URL", "LLM_API_BASE", "OPENAI_BASE_URL", "OPENAI_API_BASE", "API_BASE"]),
    model: firstValue(values, ["LLM_MODEL", "OPENAI_MODEL", "MODEL"]),
  };
}

export function draftLiteLLMModelFromEnv(raw: string): LiteLLMEnvModelDraft | null {
  const parsed = parseLLMEnvBlock(raw);
  if (!parsed.apiKey && !parsed.apiBase && !parsed.model) return null;

  const providerPreset = detectPresetFromAPIBase(parsed.apiBase);
  const preset = LITELLM_PROVIDER_PRESETS.find((item) => item.value === providerPreset);
  const provider = preset?.llmProvider ?? "openai";
  const modelName = parsed.model?.trim();

  return {
    apiKey: parsed.apiKey,
    apiBase: parsed.apiBase,
    modelName,
    providerModel: modelName ? normalizeOpenAICompatibleModel(modelName) : undefined,
    provider,
    providerPreset,
  };
}

export function detectPresetFromAPIBase(apiBase?: string): string {
  const normalized = (apiBase ?? "").trim().toLowerCase();
  if (normalized.includes("dashscope-intl.aliyuncs.com")) return "dashscope-intl-openai";
  if (normalized.includes("dashscope.aliyuncs.com")) return "dashscope-cn-openai";
  if (normalized.includes("openrouter.ai")) return "openrouter";
  if (normalized.includes("api.groq.com")) return "groq";
  return "openai";
}

export function buildPlatformLiteLLMModelInput(draft: LiteLLMModelDraft): PlatformLiteLLMModelInput {
  const provider = normalizeLiteLLMProvider(draft.provider, draft.providerModel);
  const model = normalizeLiteLLMModel(draft.providerModel, provider);

  return {
    model_name: normalizeLiteLLMModelName(draft.modelName, model),
    model,
    custom_llm_provider: provider || undefined,
    api_base: trimOptional(draft.apiBase),
    api_version: trimOptional(draft.apiVersion),
    api_key: trimOptional(draft.apiKey),
  };
}

export function normalizeLiteLLMProvider(provider: string, model: string): string {
  const clean = provider.trim().toLowerCase();
  if (clean === "google" || clean === "google-ai" || clean === "google-ai-studio" || clean === "ai-studio") {
    return "gemini";
  }
  if (clean === "vertex" || clean === "vertexai") {
    return "vertex_ai";
  }
  if (clean) return clean;

  const cleanModel = model.trim().toLowerCase();
  if (cleanModel.startsWith("gemini/") || cleanModel.startsWith("gemini-")) return "gemini";
  if (cleanModel.startsWith("openrouter/")) return "openrouter";
  if (cleanModel.startsWith("openai/")) return "openai";
  if (cleanModel.startsWith("anthropic/")) return "anthropic";
  return "";
}

export function normalizeLiteLLMModel(model: string, provider: string): string {
  const clean = model.trim();
  if (!clean) return "";
  if (provider === "gemini" && !clean.includes("/")) return `gemini/${clean}`;
  return clean;
}

export function normalizeLiteLLMModelName(modelName: string, model: string): string {
  const clean = modelName.trim();
  if (clean) return clean;
  return stripKnownProviderPrefix(model.trim());
}

export function stripKnownProviderPrefix(model: string): string {
  for (const prefix of ["gemini/", "openai/", "anthropic/", "openrouter/"]) {
    if (model.startsWith(prefix)) return model.slice(prefix.length);
  }
  return model;
}

export function normalizeOpenAICompatibleModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/")) return trimmed;
  return `openai/${trimmed}`;
}

export function modelWithPrefix(model: string, prefix?: string): string {
  const trimmed = model.trim();
  if (!trimmed || !prefix || trimmed.startsWith(prefix) || trimmed.includes("/")) return trimmed;
  return `${prefix}${trimmed}`;
}

function firstValue(values: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = values.get(key);
    if (value) return value;
  }
  return undefined;
}

function stripOptionalQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if ((char === `"` || char === `'`) && value[i - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && !quote && /\s/.test(value[i - 1] ?? "")) {
      return value.slice(0, i);
    }
  }
  return value;
}

function trimOptional(value: string): string | undefined {
  const clean = value.trim();
  return clean || undefined;
}
