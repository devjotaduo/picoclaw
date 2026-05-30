import { describe, expect, it } from "vitest";

import { joinModelList, splitModelList } from "@/lib/model-routing";

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
});

