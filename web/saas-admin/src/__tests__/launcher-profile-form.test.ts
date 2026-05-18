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

import { buildSeedFromForm } from "@/lib/launcher-profile-form";

describe("buildSeedFromForm", () => {
  it("preserves unknown config keys (round-trip)", () => {
    const cfg = {
      tools: { web: { sogou: { enabled: true } } },
      ui: { show_model_selector: false, show_reasoning: true, show_tool_calls: false },
      hooks: { enabled: true },
    };
    const form = buildFormFromSeed(PROFILE, seed({ config_json: cfg }));
    const out = buildSeedFromForm(form);
    expect(out.config_json.tools).toEqual(cfg.tools);
    expect(out.config_json.hooks).toEqual(cfg.hooks);
    expect((out.config_json.ui as Record<string, unknown>).show_model_selector).toBe(false);
  });

  it("serialises behavior toggles back to snake_case", () => {
    const form = buildFormFromSeed(PROFILE, seed());
    form.behavior.masterEnabled = false;
    form.behavior.respondInDM = false;
    form.behavior.outboundOnlyMode = true;
    form.behavior.schedule.monday = { open: false, from: "09:00", to: "17:00" };
    const out = buildSeedFromForm(form);
    expect(out.behavior_json).toMatchObject({
      master_enabled: false,
      respond_in_dm: false,
      outbound_only_mode: true,
      schedule: { monday: { open: false, from: "09:00", to: "17:00" } },
    });
  });

  it("rewrites agents.list while keeping defaults block intact", () => {
    const cfg = {
      agents: {
        defaults: { provider: "openrouter", model_name: "x" },
        list: [
          {
            id: "main",
            name: "Ana",
            model: "x",
            role_config: { kind: "attendant", description: "" },
          },
        ],
      },
    };
    const form = buildFormFromSeed(PROFILE, seed({ config_json: cfg }));
    form.agents[0]!.name = "Ana 2";
    const out = buildSeedFromForm(form);
    const outAgents = out.config_json.agents as Record<string, unknown>;
    expect((outAgents.defaults as Record<string, unknown>).provider).toBe("openrouter");
    expect((outAgents.list as Array<Record<string, unknown>>)[0]!.name).toBe("Ana 2");
  });
});
