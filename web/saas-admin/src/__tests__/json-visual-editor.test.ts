import { describe, expect, it } from "vitest";

import {
  addJSONObjectProperty,
  appendJSONArrayItem,
  deleteJSONValueAtPath,
  formatVisualJSON,
  getJSONValueType,
  parseJSONScalar,
  parseJSONText,
  setJSONValueAtPath,
} from "@/lib/json-visual-editor";

describe("json visual editor helpers", () => {
  it("parses and formats valid JSON", () => {
    const parsed = parseJSONText(`{"ui":{"show_reasoning":true}}`);

    expect(parsed.error).toBeNull();
    expect(parsed.value).toEqual({ ui: { show_reasoning: true } });
    expect(formatVisualJSON(parsed.value!)).toContain('"show_reasoning": true');
  });

  it("keeps invalid JSON out of the visual state", () => {
    const parsed = parseJSONText(`{"ui":`);

    expect(parsed.value).toBeNull();
    expect(parsed.error).toBeTruthy();
  });

  it("updates nested values immutably", () => {
    const root = { ui: { show_tool_calls: true }, list: [1] };
    const next = setJSONValueAtPath(root, ["ui", "show_tool_calls"], false);

    expect(next).toEqual({ ui: { show_tool_calls: false }, list: [1] });
    expect(root.ui.show_tool_calls).toBe(true);
  });

  it("adds object properties and appends array items", () => {
    const withProperty = addJSONObjectProperty({}, [], "agents", "array");
    const withItem = appendJSONArrayItem(withProperty.value, ["agents"], "object");

    expect(withProperty.error).toBeNull();
    expect(withItem.value).toEqual({ agents: [{}] });
  });

  it("deletes object properties and array items", () => {
    const withoutProperty = deleteJSONValueAtPath(
      { ui: true, agents: ["main", "vendas"] },
      ["ui"],
    );
    const withoutItem = deleteJSONValueAtPath(withoutProperty, ["agents", 0]);

    expect(withoutItem).toEqual({ agents: ["vendas"] });
  });

  it("parses scalar inputs by selected type", () => {
    expect(parseJSONScalar("42", "number")).toEqual({ value: 42, error: null });
    expect(parseJSONScalar("false", "boolean")).toEqual({
      value: false,
      error: null,
    });
    expect(getJSONValueType(["x"])).toBe("array");
  });
});
