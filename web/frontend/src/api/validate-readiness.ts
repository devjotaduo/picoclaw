import { launcherFetch } from "@/api/http"

export type IntegrationStatus = "pending" | "resolved"

export interface IntegrationEntry {
  key: string
  status: IntegrationStatus
  admin_action: string
}

export interface UniversalChecks {
  nome: boolean
  segmento: boolean
  contato_email: boolean
  contato_whatsapp: boolean
}

export interface ValidateReadinessResponse {
  ok: boolean
  universal: UniversalChecks
  // Dynamic key: "segmento_<key>" → Record<string, boolean>
  [segmentKey: string]: unknown
  integracoes_required: IntegrationEntry[]
  integracoes_informativas: IntegrationEntry[]
  missing_summary: string[]
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function getValidateReadiness(): Promise<ValidateReadinessResponse> {
  const res = await launcherFetch("/api/workspace/validate-readiness", {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<ValidateReadinessResponse>
}

export async function markIntegrationResolved(
  key: string,
): Promise<ValidateReadinessResponse> {
  const res = await launcherFetch(
    `/api/workspace/integration/${encodeURIComponent(key)}/mark-resolved`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<ValidateReadinessResponse>
}

/**
 * Extracts the dynamic "segmento_<key>" entry from the response,
 * returning the bare segment key (without prefix) and its check map.
 */
export function extractSegmentChecks(
  resp: ValidateReadinessResponse,
): { key: string; checks: Record<string, boolean> } | null {
  for (const k of Object.keys(resp)) {
    if (k.startsWith("segmento_") && resp[k] && typeof resp[k] === "object") {
      return {
        key: k.replace(/^segmento_/, ""),
        checks: resp[k] as Record<string, boolean>,
      }
    }
  }
  return null
}

/**
 * Counts how many checks are passing across universal + active segment.
 * Used by the header summary "X de Y itens prontos".
 */
export function countReadinessProgress(resp: ValidateReadinessResponse): {
  done: number
  total: number
} {
  let done = 0
  let total = 0

  for (const v of Object.values(resp.universal)) {
    total += 1
    if (v) done += 1
  }

  const seg = extractSegmentChecks(resp)
  if (seg) {
    for (const v of Object.values(seg.checks)) {
      total += 1
      if (v) done += 1
    }
  }

  for (const item of resp.integracoes_required ?? []) {
    total += 1
    if (item.status === "resolved") done += 1
  }

  return { done, total }
}
