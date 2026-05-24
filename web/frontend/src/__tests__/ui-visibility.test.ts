import { describe, expect, it } from "vitest"

import {
  DEFAULT_UI_VISIBILITY_POLICY,
  type UIVisibilityPolicy,
  isUIElementVisible,
  resolveUIVisibilityProfile,
} from "@/api/ui-visibility"

const policy: UIVisibilityPolicy = {
  version: 1,
  active_profile: null,
  default_profile: "tenant",
  default_visibility: true,
  profiles: {
    admin: {
      visibility: {
        "sidebar.models": true,
      },
    },
    tenant: {
      visibility: {
        "sidebar.models": false,
      },
    },
    public: {
      visibility: {
        "sidebar.chat": true,
        "sidebar.models": false,
      },
    },
    waiting: {
      visibility: {
        "layout.waiting_screen": true,
      },
    },
  },
}

describe("ui visibility policy", () => {
  it("resolves admin, tenant and public profiles from launcher policy", () => {
    expect(
      resolveUIVisibilityProfile(policy, {
        role: "platform_admin",
        is_saas_admin: true,
      }),
    ).toBe("admin")
    expect(
      resolveUIVisibilityProfile(policy, {
        role: "platform_admin",
        is_saas_admin: false,
      }),
    ).toBe("tenant")
    expect(
      resolveUIVisibilityProfile(policy, {
        role: "tenant_admin",
        is_saas_admin: false,
      }),
    ).toBe("tenant")
    expect(resolveUIVisibilityProfile(policy)).toBe("public")
  })

  it("uses local active profile override when present", () => {
    expect(
      resolveUIVisibilityProfile(
        { ...policy, active_profile: "public" },
        {
          role: "platform_admin",
          is_saas_admin: true,
        },
      ),
    ).toBe("public")
  })

  it("uses profile visibility and falls back to default visibility", () => {
    expect(isUIElementVisible(policy, "tenant", "sidebar.models")).toBe(false)
    expect(isUIElementVisible(policy, "admin", "sidebar.models")).toBe(true)
    expect(isUIElementVisible(policy, "tenant", "sidebar.chat")).toBe(true)
  })

  it("assigns public-only hidden controls to the public profile", () => {
    expect(
      isUIElementVisible(
        DEFAULT_UI_VISIBILITY_POLICY,
        "public",
        "chat.context_usage",
      ),
    ).toBe(false)
    expect(
      isUIElementVisible(
        DEFAULT_UI_VISIBILITY_POLICY,
        "public",
        "chat.reasoning_messages",
      ),
    ).toBe(false)
    expect(
      isUIElementVisible(
        DEFAULT_UI_VISIBILITY_POLICY,
        "public",
        "agent_editor.create_agents",
      ),
    ).toBe(false)
    expect(
      isUIElementVisible(
        DEFAULT_UI_VISIBILITY_POLICY,
        "tenant",
        "chat.context_usage",
      ),
    ).toBe(true)
  })
})
