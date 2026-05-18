export type LauncherDisplayKey = "show_reasoning" | "show_tool_calls";

export interface LauncherDisplayState {
  showReasoning: boolean;
  showToolCalls: boolean;
  error: string | null;
}

const defaultDisplayState: LauncherDisplayState = {
  showReasoning: true,
  showToolCalls: true,
  error: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRootRecord(configText: string): Record<string, unknown> {
  const parsed = JSON.parse(configText.trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config.json precisa ser um objeto JSON");
  }
  return parsed as Record<string, unknown>;
}

export function parseLauncherDisplayConfig(
  configText: string,
): LauncherDisplayState {
  try {
    const root = parseRootRecord(configText);
    const ui = asRecord(root.ui);
    return {
      showReasoning:
        typeof ui.show_reasoning === "boolean"
          ? ui.show_reasoning
          : defaultDisplayState.showReasoning,
      showToolCalls:
        typeof ui.show_tool_calls === "boolean"
          ? ui.show_tool_calls
          : defaultDisplayState.showToolCalls,
      error: null,
    };
  } catch (error) {
    return {
      ...defaultDisplayState,
      error: error instanceof Error ? error.message : "config.json inválido",
    };
  }
}

export function setLauncherDisplayOption(
  configText: string,
  key: LauncherDisplayKey,
  value: boolean,
): string {
  const root = parseRootRecord(configText);
  const ui = { ...asRecord(root.ui), [key]: value };
  return JSON.stringify({ ...root, ui }, null, 2);
}
