export function splitModelList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      out.push(item);
    });
  return out;
}

export function joinModelList(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

export function normalizeModelList(value: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value ?? []) {
    const model = item.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

export const DEFAULT_LITELLM_MODEL_NAME = "qwen-plus";
export const DEFAULT_LITELLM_FALLBACKS = ["deepseek-chat"];

export function modelNameChoices(registered: string[], current: string[] = []): string[] {
  return normalizeModelList([...registered, ...current]);
}

export function addModelName(value: string[], model: string): string[] {
  return normalizeModelList([...value, model]);
}

export function removeModelName(value: string[], model: string): string[] {
  return normalizeModelList(value).filter((item) => item !== model);
}

export type CLIModelPreset = {
  id: string;
  label: string;
  model: string;
  description: string;
};

export const CUSTOM_CLI_MODEL_PRESET_ID = "custom";

export const CLAUDE_CLI_MODEL_PRESETS: CLIModelPreset[] = [
  {
    id: "sonnet",
    label: "Sonnet",
    model: "sonnet",
    description: "Padrao recomendado; o Claude CLI resolve para o Sonnet disponivel mais novo.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    model: "claude-sonnet-4-6",
    description: "Pin fixo para estabilidade em coding e atendimento.",
  },
  {
    id: "haiku",
    label: "Haiku",
    model: "haiku",
    description: "Mais rapido e economico para tarefas simples.",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    model: "claude-haiku-4-5-20251001",
    description: "Pin rapido para respostas simples e baixo custo.",
  },
  {
    id: "opus",
    label: "Opus",
    model: "opus",
    description: "Mais forte para raciocinio complexo.",
  },
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    model: "claude-opus-4-8",
    description: "Pin forte para planejamento e tarefas complexas.",
  },
  {
    id: "sonnet-1m",
    label: "Sonnet 1M",
    model: "sonnet[1m]",
    description: "Sonnet com janela longa para sessoes grandes.",
  },
  {
    id: "opusplan",
    label: "Opus plan",
    model: "opusplan",
    description: "Usa Opus no planejamento e Sonnet na execucao.",
  },
];

export const CODEX_CLI_MODEL_PRESETS: CLIModelPreset[] = [
  {
    id: "codex-cli",
    label: "Padrao do config.toml",
    model: "codex-cli",
    description: "Nao passa -m; deixa o CODEX_HOME/config.toml escolher.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    model: "gpt-5.5",
    description: "Recomendado para coding complexo, planejamento e uso de ferramentas.",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    model: "gpt-5.4",
    description: "Modelo forte para trabalho profissional e multi-etapas.",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    model: "gpt-5.4-mini",
    description: "Mais rapido e economico para tarefas leves e subagentes.",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    model: "gpt-5.3-codex",
    description: "Modelo de coding para engenharia de software mais complexa.",
  },
  {
    id: "gpt-5.3-codex-spark",
    label: "GPT-5.3 Codex Spark",
    model: "gpt-5.3-codex-spark",
    description: "Preview rapido para iteracao quase em tempo real em contas Pro.",
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    model: "gpt-5.2",
    description: "Alternativa anterior para depuracao e tarefas agenticas.",
  },
];

export function cliPresetIDForModel(
  value: string | undefined,
  presets: CLIModelPreset[],
  defaultPresetID: string,
): string {
  const model = (value ?? "").trim();
  if (!model) return defaultPresetID;
  return (
    presets.find((preset) => preset.model === model || preset.id === model)?.id ??
    CUSTOM_CLI_MODEL_PRESET_ID
  );
}

export function cliModelValueFromPreset(
  presetID: string,
  customValue: string,
  presets: CLIModelPreset[],
): string {
  if (presetID === CUSTOM_CLI_MODEL_PRESET_ID) return customValue.trim();
  return presets.find((preset) => preset.id === presetID)?.model ?? "";
}

export function cliPresetDescription(presetID: string, presets: CLIModelPreset[]): string {
  if (presetID === CUSTOM_CLI_MODEL_PRESET_ID) return "Digite o identificador aceito pelo CLI.";
  return presets.find((preset) => preset.id === presetID)?.description ?? "";
}

