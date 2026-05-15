import { launcherFetch } from "@/api/http"
import type {
  TemplateApplyPayload,
  TemplateApplyResponse,
  TemplateSkillConfig,
} from "@/components/agent/templates/types"

export interface TemplateOverride {
  skill_configs?: TemplateSkillConfig[]
  draft?: TemplateApplyPayload
}

export interface TemplateOverridesResponse {
  overrides: Record<string, TemplateOverride>
}

export interface TemplateOverrideSaveResponse {
  status: string
  template_id: string
  override: TemplateOverride
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const raw = await res.text()
    if (raw.trim() === "") {
      return `API error: ${res.status} ${res.statusText}`
    }
    try {
      const body = JSON.parse(raw) as { error?: string; errors?: string[] }
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        return body.errors.join("; ")
      }
      if (typeof body.error === "string" && body.error.trim() !== "") {
        return body.error
      }
    } catch {
      return raw.trim()
    }
  } catch {
    // ignore invalid body
  }
  return `API error: ${res.status} ${res.statusText}`
}

export async function applyAgentTemplate(
  payload: TemplateApplyPayload,
): Promise<TemplateApplyResponse> {
  const res = await launcherFetch("/api/agent/templates/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateApplyResponse>
}

export async function getTemplateOverrides(): Promise<TemplateOverridesResponse> {
  const res = await launcherFetch("/api/agent/templates/overrides")
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateOverridesResponse>
}

export async function saveTemplateOverride(
  templateId: string,
  override: TemplateOverride,
): Promise<TemplateOverrideSaveResponse> {
  const res = await launcherFetch(
    `/api/agent/templates/overrides/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(override),
    },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<TemplateOverrideSaveResponse>
}

export interface AgentConfigResponse {
  configured: boolean
  payload?: TemplateApplyPayload
  applied_at?: number
}

export async function getAgentConfig(): Promise<AgentConfigResponse> {
  const res = await launcherFetch("/api/agent/config")
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<AgentConfigResponse>
}

export async function resetTemplateOverride(
  templateId: string,
): Promise<{ status: string; template_id: string }> {
  const res = await launcherFetch(
    `/api/agent/templates/overrides/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }
  return res.json() as Promise<{ status: string; template_id: string }>
}
