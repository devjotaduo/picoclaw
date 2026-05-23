import type { LauncherPolicyResponse } from "@/api/launcher-policy"

export type UIVisibilityProfile = "admin" | "tenant" | "public"

export interface UIVisibilityProfileConfig {
  description?: string
  visibility: Record<string, boolean>
}

export interface UIVisibilityPolicy {
  version: number
  source?: string
  active_profile?: UIVisibilityProfile | null
  default_profile: UIVisibilityProfile
  default_visibility: boolean
  profiles: Record<UIVisibilityProfile, UIVisibilityProfileConfig>
}

export const LOCAL_UI_VISIBILITY_POLICY_URL = "/mock-api/ui-visibility.json"

export const DEFAULT_UI_VISIBILITY_POLICY: UIVisibilityPolicy = {
  version: 1,
  source: "frontend-fallback",
  active_profile: null,
  default_profile: "tenant",
  default_visibility: true,
  profiles: {
    admin: { visibility: {} },
    tenant: {
      visibility: {
        "layout.sidebar_trigger": true,
        "header.actions": true,
        "header.sidebar_toggle": false,
        "header.connection_status": false,
        "header.settings": true,
        "header.logout": true,
        "header.gateway_restart": true,
        "header.gateway_status": true,
        "header.gateway_start_stop": true,
        "header.theme_toggle": true,
        "header.gateway_stop_menu": true,
        "sidebar.navigation": true,
        "sidebar.pending_requests": true,
        "sidebar.models": false,
        "sidebar.credentials": false,
        "sidebar.agent_hub": false,
        "sidebar.agent_templates": false,
        "sidebar.template_editor": false,
        "sidebar.skills": false,
        "sidebar.skill_editor": false,
        "sidebar.tools": false,
        "sidebar.logs": false,
        "chat.model_selector": false,
        "chat.assistant_details_toggle": false,
        "chat.new_chat": false,
        "chat.session_history": false,
        "chat.test_attendant": true,
        "chat.quality_indicator": true,
        "chat.context_usage": true,
        "chat.quick_tasks": true,
        "chat.reasoning_messages": true,
        "chat.tool_call_messages": true,
        "agent_editor.create_agents": true,
        "chat.pending_handoffs_sidebar": true,
      },
    },
    public: {
      visibility: {
        "layout.sidebar_trigger": false,
        "header.actions": true,
        "header.sidebar_toggle": false,
        "header.connection_status": false,
        "header.settings": false,
        "header.logout": false,
        "header.gateway_restart": false,
        "header.gateway_status": true,
        "header.gateway_start_stop": false,
        "header.theme_toggle": false,
        "header.gateway_stop_menu": false,
        "sidebar.navigation": false,
        "sidebar.pending_requests": false,
        "sidebar.chat": false,
        "sidebar.models": false,
        "sidebar.credentials": false,
        "sidebar.agent_dashboard": false,
        "sidebar.agent_editor": false,
        "sidebar.whatsapp_inbox": false,
        "sidebar.whatsapp_reports": false,
        "sidebar.agent_hub": false,
        "sidebar.agent_templates": false,
        "sidebar.template_editor": false,
        "sidebar.skills": false,
        "sidebar.skill_editor": false,
        "sidebar.readiness": false,
        "sidebar.memory": false,
        "sidebar.pendencias": false,
        "sidebar.cron": false,
        "sidebar.integrations": false,
        "sidebar.tools": false,
        "sidebar.config": false,
        "sidebar.logs": false,
        "sidebar.admin_tenants": false,
        "sidebar.admin_new_tenant": false,
        "sidebar.admin_clone": false,
        "chat.model_selector": false,
        "chat.assistant_details_toggle": false,
        "chat.new_chat": false,
        "chat.session_history": false,
        "chat.test_attendant": false,
        "chat.quality_indicator": false,
        "chat.context_usage": false,
        "chat.quick_tasks": false,
        "chat.reasoning_messages": false,
        "chat.tool_call_messages": false,
        "agent_editor.create_agents": false,
        "chat.pending_handoffs_sidebar": false,
      },
    },
  },
}

export async function getLocalUIVisibilityPolicy(): Promise<UIVisibilityPolicy> {
  const res = await fetch(LOCAL_UI_VISIBILITY_POLICY_URL, {
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`UI visibility policy error: ${res.status}`)
  }
  return normalizeUIVisibilityPolicy(await res.json())
}

// localStorage key used by the runtime template selector to override
// auto-resolution. Set via setUIVisibilityProfileOverride(); cleared by
// passing null. Other tabs / hooks observe changes via the "storage" event.
export const UI_VISIBILITY_OVERRIDE_STORAGE_KEY = "picoclaw.ui-visibility.override"

export function getUIVisibilityProfileOverride(): UIVisibilityProfile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(UI_VISIBILITY_OVERRIDE_STORAGE_KEY)
    return isUIVisibilityProfile(raw) ? raw : null
  } catch {
    return null
  }
}

export function setUIVisibilityProfileOverride(
  profile: UIVisibilityProfile | null,
): void {
  if (typeof window === "undefined") return
  try {
    if (profile) {
      window.localStorage.setItem(UI_VISIBILITY_OVERRIDE_STORAGE_KEY, profile)
    } else {
      window.localStorage.removeItem(UI_VISIBILITY_OVERRIDE_STORAGE_KEY)
    }
    // Notify same-tab listeners (the native "storage" event only fires
    // across tabs/windows, not within the tab that performed the write).
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: UI_VISIBILITY_OVERRIDE_STORAGE_KEY,
        newValue: profile,
      }),
    )
  } catch {
    // best-effort — Safari private mode etc. just won't persist
  }
}

export function resolveUIVisibilityProfile(
  policy: UIVisibilityPolicy,
  launcherPolicy?: Pick<LauncherPolicyResponse, "role" | "is_saas_admin">,
): UIVisibilityProfile {
  // Runtime override from the template selector takes precedence over
  // both the JSON's `active_profile` field and the role-based resolution.
  // This is the dev/admin "preview as ..." switch.
  const override = getUIVisibilityProfileOverride()
  if (override) {
    return override
  }

  if (policy.active_profile) {
    return policy.active_profile
  }

  if (launcherPolicy?.is_saas_admin) {
    return "admin"
  }

  switch (launcherPolicy?.role) {
    case "platform_admin":
      return "tenant"
    case "tenant_owner":
    case "tenant_admin":
    case "operator":
    case "viewer":
      return "tenant"
    default:
      return "public"
  }
}

export function isUIElementVisible(
  policy: UIVisibilityPolicy,
  profile: UIVisibilityProfile,
  element: string,
  fallback = policy.default_visibility,
): boolean {
  const profileVisibility =
    policy.profiles[profile]?.visibility ??
    policy.profiles[policy.default_profile]?.visibility ??
    {}

  if (Object.hasOwn(profileVisibility, element)) {
    return profileVisibility[element] !== false
  }

  return fallback
}

function normalizeUIVisibilityPolicy(value: unknown): UIVisibilityPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_UI_VISIBILITY_POLICY
  }

  const raw = value as Partial<UIVisibilityPolicy>
  const defaultProfile = isUIVisibilityProfile(raw.default_profile)
    ? raw.default_profile
    : DEFAULT_UI_VISIBILITY_POLICY.default_profile

  return {
    version:
      typeof raw.version === "number"
        ? raw.version
        : DEFAULT_UI_VISIBILITY_POLICY.version,
    source:
      typeof raw.source === "string"
        ? raw.source
        : DEFAULT_UI_VISIBILITY_POLICY.source,
    active_profile: isUIVisibilityProfile(raw.active_profile)
      ? raw.active_profile
      : null,
    default_profile: defaultProfile,
    default_visibility:
      typeof raw.default_visibility === "boolean"
        ? raw.default_visibility
        : DEFAULT_UI_VISIBILITY_POLICY.default_visibility,
    profiles: {
      admin: normalizeProfile(raw.profiles?.admin),
      tenant: normalizeProfile(raw.profiles?.tenant),
      public: normalizeProfile(raw.profiles?.public),
    },
  }
}

function normalizeProfile(value: unknown): UIVisibilityProfileConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { visibility: {} }
  }
  const raw = value as Partial<UIVisibilityProfileConfig>
  const visibility =
    raw.visibility &&
    typeof raw.visibility === "object" &&
    !Array.isArray(raw.visibility)
      ? Object.fromEntries(
          Object.entries(raw.visibility).filter(
            ([key, visible]) =>
              typeof key === "string" && typeof visible === "boolean",
          ),
        )
      : {}

  return {
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    visibility,
  }
}

function isUIVisibilityProfile(value: unknown): value is UIVisibilityProfile {
  return value === "admin" || value === "tenant" || value === "public"
}
