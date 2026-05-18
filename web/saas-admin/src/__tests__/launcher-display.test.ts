import { describe, expect, it } from "vitest";

import {
  parseLauncherDisplayConfig,
  setLauncherDisplayOption,
} from "@/lib/launcher-display";

describe("launcher display helpers", () => {
  it("defaults missing UI flags to visible", () => {
    const parsed = parseLauncherDisplayConfig(`{"version":3}`);

    expect(parsed.error).toBeNull();
    expect(parsed.showReasoning).toBe(true);
    expect(parsed.showToolCalls).toBe(true);
  });

  it("updates display flags without losing existing config", () => {
    const next = setLauncherDisplayOption(
      `{"version":3,"agents":{"defaults":{"workspace":"/tmp"}}}`,
      "show_tool_calls",
      false,
    );
    const parsed = JSON.parse(next);

    expect(parsed.version).toBe(3);
    expect(parsed.agents.defaults.workspace).toBe("/tmp");
    expect(parsed.ui.show_tool_calls).toBe(false);
  });

  it("reports invalid JSON without changing visual state", () => {
    const parsed = parseLauncherDisplayConfig(`{"version":`);

    expect(parsed.error).toBeTruthy();
    expect(parsed.showReasoning).toBe(true);
    expect(parsed.showToolCalls).toBe(true);
  });

  it("rejects non-object config roots", () => {
    const parsed = parseLauncherDisplayConfig(`[]`);

    expect(parsed.error).toContain("objeto JSON");
  });
});
