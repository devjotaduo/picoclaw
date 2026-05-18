import { describe, expect, it } from "vitest";

import {
  WEEKDAYS,
  buildFormFromSeed,
  type SeedBundle,
} from "@/lib/launcher-profile-form";

const PROFILE = {
  name: "Default",
  slug: "default",
  description: "",
  is_default: true,
  role_policy: {},
};

function seed(overrides: Partial<SeedBundle> = {}): SeedBundle {
  return {
    config_json: {},
    agent_md: "",
    soul_md: "",
    behavior_json: {},
    ...overrides,
  };
}

describe("buildFormFromSeed", () => {
  it("copies profile metadata into the form", () => {
    const form = buildFormFromSeed(PROFILE, seed());
    expect(form.name).toBe("Default");
    expect(form.slug).toBe("default");
    expect(form.isDefault).toBe(true);
    expect(form.rolePolicyMode).toBe("visual");
  });

  it("reads agents.list into structured AgentForms", () => {
    const form = buildFormFromSeed(
      PROFILE,
      seed({
        config_json: {
          agents: {
            list: [
              {
                id: "main",
                name: "Ana",
                model: "openrouter-sonnet-4.5",
                default: true,
                skills: ["faq-answering"],
                role_config: { kind: "attendant", description: "Atende" },
                avatar: {
                  type: "preset",
                  icon: "headset",
                  initials: "AN",
                  background: "#2563eb",
                  foreground: "#ffffff",
                },
              },
            ],
          },
        },
      }),
    );
    expect(form.agents).toHaveLength(1);
    const ana = form.agents[0]!;
    expect(ana.id).toBe("main");
    expect(ana.name).toBe("Ana");
    expect(ana.roleKind).toBe("attendant");
    expect(ana.description).toBe("Atende");
    expect(ana.skills).toEqual(["faq-answering"]);
    expect(ana.default).toBe(true);
    expect(ana.avatar.icon).toBe("headset");
  });

  it("reads behavior.json including schedule with defaults for missing days", () => {
    const form = buildFormFromSeed(
      PROFILE,
      seed({
        behavior_json: {
          master_enabled: false,
          respond_in_dm: true,
          schedule: { monday: { open: true, from: "07:00", to: "12:00" } },
        },
      }),
    );
    expect(form.behavior.masterEnabled).toBe(false);
    expect(form.behavior.respondInDM).toBe(true);
    expect(form.behavior.schedule.monday).toEqual({
      open: true,
      from: "07:00",
      to: "12:00",
    });
    // missing day falls back to default
    for (const d of WEEKDAYS) {
      expect(form.behavior.schedule[d]).toBeDefined();
    }
  });

  it("reads ui.show_* into display form", () => {
    const form = buildFormFromSeed(
      PROFILE,
      seed({
        config_json: {
          ui: { show_model_selector: false, show_reasoning: true, show_tool_calls: false },
        },
      }),
    );
    expect(form.display.showModelSelector).toBe(false);
    expect(form.display.showReasoning).toBe(true);
    expect(form.display.showToolCalls).toBe(false);
  });

  it("preserves baseline raw config and behavior", () => {
    const cfg = { tools: { web: { sogou: { enabled: true } } }, ui: {} };
    const beh = { master_enabled: true };
    const form = buildFormFromSeed(
      PROFILE,
      seed({ config_json: cfg, behavior_json: beh }),
    );
    expect(form.configBaseline).toEqual(cfg);
    expect(form.behaviorBaseline).toEqual(beh);
  });
});
