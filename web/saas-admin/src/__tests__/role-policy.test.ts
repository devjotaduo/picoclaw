import { describe, expect, it } from "vitest";

import type {
  LauncherPolicyCatalog,
  RolePolicy,
} from "@/api/launcher-profiles";
import {
  applyRolePreset,
  normalizeRolePolicy,
  parseRolePolicyText,
  setFeatureAccessForAllRoles,
} from "@/lib/role-policy";

const catalog: LauncherPolicyCatalog = {
  roles: [
    { id: "tenant_owner", label: "Owner", description: "" },
    { id: "operator", label: "Operator", description: "" },
    { id: "viewer", label: "Viewer", description: "" },
  ],
  access_levels: [
    { id: "none", label: "None", description: "" },
    { id: "read", label: "Read", description: "" },
    { id: "write", label: "Write", description: "" },
  ],
  groups: [{ id: "agent", label: "Agent", description: "" }],
  features: [
    { id: "tools", label: "Tools", description: "", group: "agent" },
    {
      id: "agent_hub",
      label: "Hub",
      description: "",
      group: "agent",
      fallback: "tools",
    },
    { id: "skills", label: "Skills", description: "", group: "agent" },
    {
      id: "skill_editor",
      label: "Skill editor",
      description: "",
      group: "agent",
      fallback: "skills",
    },
    { id: "whatsapp_inbox", label: "Inbox", description: "", group: "agent" },
    {
      id: "whatsapp_reports",
      label: "Reports",
      description: "",
      group: "agent",
      fallback: "whatsapp_inbox",
    },
    { id: "logs", label: "Logs", description: "", group: "agent" },
  ],
  default_role_policy: {
    tenant_owner: {
      tools: "write",
      agent_hub: "write",
      skills: "write",
      skill_editor: "write",
      whatsapp_inbox: "write",
      whatsapp_reports: "write",
      logs: "write",
    },
    operator: {
      tools: "none",
      agent_hub: "none",
      skills: "none",
      skill_editor: "none",
      whatsapp_inbox: "write",
      whatsapp_reports: "read",
      logs: "read",
    },
    viewer: {
      tools: "read",
      agent_hub: "read",
      skills: "read",
      skill_editor: "read",
      whatsapp_inbox: "read",
      whatsapp_reports: "read",
      logs: "read",
    },
  },
};

describe("role policy helpers", () => {
  it("derives fine features from explicit legacy groups", () => {
    const normalized = normalizeRolePolicy(
      {
        viewer: {
          tools: "none",
          skills: "none",
          whatsapp_inbox: "none",
        },
      } as RolePolicy,
      catalog,
    );

    expect(normalized.viewer.agent_hub).toBe("none");
    expect(normalized.viewer.skill_editor).toBe("none");
    expect(normalized.viewer.whatsapp_reports).toBe("none");
  });

  it("keeps visual policy in sync with valid JSON only", () => {
    const valid = parseRolePolicyText('{"viewer":{"tools":"none"}}', catalog);
    expect(valid.error).toBeNull();
    expect(valid.policy?.viewer.agent_hub).toBe("none");

    const invalid = parseRolePolicyText('{"viewer":{"tools":"bad"}}', catalog);
    expect(invalid.policy).toBeNull();
    expect(invalid.error).toContain("Role policy");
  });

  it("applies presets and row changes", () => {
    const withPreset = applyRolePreset(
      catalog.default_role_policy,
      catalog,
      "operator",
      "operator",
    );
    expect(withPreset.operator.whatsapp_inbox).toBe("write");
    expect(withPreset.operator.whatsapp_reports).toBe("read");
    expect(withPreset.operator.tools).toBe("none");

    const withRow = setFeatureAccessForAllRoles(
      withPreset,
      catalog,
      "skills",
      "read",
    );
    expect(withRow.tenant_owner.skills).toBe("read");
    expect(withRow.operator.skills).toBe("read");
    expect(withRow.viewer.skills).toBe("read");
  });
});
