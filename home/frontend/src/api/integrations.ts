import { launcherFetch } from "@/api/http"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationConfig {
  buffer_access_token?: string
  buffer_instagram_profile_id?: string
  make_instagram_webhook_url?: string
}

export interface IntegrationStatus {
  bufferConfigured: boolean
  makeConfigured: boolean
}

export interface SaveIntegrationPayload {
  buffer_access_token?: string
  buffer_instagram_profile_id?: string
  make_instagram_webhook_url?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetches current integration configuration status from the launcher config
 * endpoint. Returns whether each integration key is set (non-empty).
 */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const res = await launcherFetch("/api/config")
  if (!res.ok) {
    // Soft-fail: treat as "not configured" when endpoint is unavailable
    return { bufferConfigured: false, makeConfigured: false }
  }
  const data = (await res.json()) as Record<string, unknown>
  return {
    bufferConfigured:
      typeof data["buffer_access_token"] === "string" &&
      data["buffer_access_token"].trim().length > 0,
    makeConfigured:
      typeof data["make_instagram_webhook_url"] === "string" &&
      data["make_instagram_webhook_url"].trim().length > 0,
  }
}

/**
 * Saves one or more integration config fields via PUT /api/config.
 * Only sends the provided keys (undefined values are omitted).
 */
export async function saveIntegrationConfig(
  payload: SaveIntegrationPayload,
): Promise<void> {
  // Strip undefined keys so we don't overwrite unrelated fields with empty values
  const body: Record<string, string> = {}
  if (payload.buffer_access_token !== undefined) {
    body["buffer_access_token"] = payload.buffer_access_token
  }
  if (payload.buffer_instagram_profile_id !== undefined) {
    body["buffer_instagram_profile_id"] = payload.buffer_instagram_profile_id
  }
  if (payload.make_instagram_webhook_url !== undefined) {
    body["make_instagram_webhook_url"] = payload.make_instagram_webhook_url
  }

  const res = await launcherFetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await asError(res))
}
