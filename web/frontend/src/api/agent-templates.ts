import { launcherFetch } from "@/api/http"
import type {
  TemplateApplyPayload,
  TemplateApplyResponse,
} from "@/components/agent/templates/types"

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
