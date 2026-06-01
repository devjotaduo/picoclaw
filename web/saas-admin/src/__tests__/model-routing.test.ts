import { describe, expect, it } from "vitest";

import {
  addModelName,
  joinModelList,
  modelNameChoices,
  normalizeModelList,
  removeModelName,
  splitModelList,
} from "@/lib/model-routing";

describe("model routing helpers", () => {
  it("splits model lists by line or comma and removes duplicates", () => {
    expect(splitModelList("gpt-4o-mini\nclaude-haiku-4-5, deepseek-chat\ngpt-4o-mini")).toEqual([
      "gpt-4o-mini",
      "claude-haiku-4-5",
      "deepseek-chat",
    ]);
  });

  it("joins model lists for textarea editing", () => {
    expect(joinModelList(["gpt-4o-mini", "claude-haiku-4-5"])).toBe("gpt-4o-mini\nclaude-haiku-4-5");
  });

  it("normalizes model arrays for select-based editing", () => {
    expect(normalizeModelList([" gpt-4o-mini ", "", "deepseek-chat", "gpt-4o-mini"])).toEqual([
      "gpt-4o-mini",
      "deepseek-chat",
    ]);
  });

  it("keeps current tenant models even when they are missing from the registered list", () => {
    expect(modelNameChoices(["gpt-4o-mini"], ["old-custom", "gpt-4o-mini"])).toEqual([
      "gpt-4o-mini",
      "old-custom",
    ]);
  });

  it("adds and removes selected models without duplicates", () => {
    expect(addModelName(["gpt-4o-mini"], "deepseek-chat")).toEqual(["gpt-4o-mini", "deepseek-chat"]);
    expect(addModelName(["gpt-4o-mini"], "gpt-4o-mini")).toEqual(["gpt-4o-mini"]);
    expect(removeModelName(["gpt-4o-mini", "deepseek-chat"], "gpt-4o-mini")).toEqual(["deepseek-chat"]);
  });
});

