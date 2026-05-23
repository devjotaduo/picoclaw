import { launcherFetch } from "@/api/http"

export type OAuthProvider =
  | "openai"
  | "anthropic"
  | "google-antigravity"
  | "github-copilot"
export type OAuthMethod =
  | "browser"
  | "device_code"
  | "token"
  | "claude_code"
  | "codex_cli"
  | "gh_cli"

export interface OAuthProviderStatus {
  provider: OAuthProvider
  display_name: string
  methods: OAuthMethod[]
  logged_in: boolean
  status: "connected" | "expired" | "needs_refresh" | "not_logged_in"
  auth_method?: string
  expires_at?: string
  expires_in_seconds?: number
  token_preview?: string
  account_id?: string
  email?: string
  project_id?: string
}

export interface OAuthFlowState {
  flow_id: string
  provider: OAuthProvider
  method: OAuthMethod
  status: "pending" | "success" | "error" | "expired"
  expires_at?: string
  error?: string
  user_code?: string
  verify_url?: string
  interval?: number
  manual_paste?: boolean
}

export interface OAuthLoginRequest {
  provider: OAuthProvider
  method: OAuthMethod
  token?: string
}

export interface OAuthLoginResponse {
  status: string
  provider: OAuthProvider
  method: OAuthMethod
  flow_id?: string
  auth_url?: string
  user_code?: string
  verify_url?: string
  interval?: number
  expires_at?: string
  manual_paste?: boolean
  redirect_uri?: string
}

interface OAuthProvidersResponse {
  providers: OAuthProviderStatus[]
}

const BASE_URL = ""

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await launcherFetch(`${BASE_URL}${path}`, options)
  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || `API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function getOAuthProviders(): Promise<OAuthProvidersResponse> {
  return request<OAuthProvidersResponse>("/api/oauth/providers")
}

export async function loginOAuth(
  payload: OAuthLoginRequest,
): Promise<OAuthLoginResponse> {
  return request<OAuthLoginResponse>("/api/oauth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function getOAuthFlow(flowID: string): Promise<OAuthFlowState> {
  return request<OAuthFlowState>(
    `/api/oauth/flows/${encodeURIComponent(flowID)}`,
  )
}

export async function pollOAuthFlow(flowID: string): Promise<OAuthFlowState> {
  return request<OAuthFlowState>(
    `/api/oauth/flows/${encodeURIComponent(flowID)}/poll`,
    {
      method: "POST",
    },
  )
}

export async function submitOAuthFlow(
  flowID: string,
  payload: { code?: string; state?: string; paste?: string },
): Promise<OAuthFlowState> {
  return request<OAuthFlowState>(
    `/api/oauth/flows/${encodeURIComponent(flowID)}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
}

export async function importGHCLI(): Promise<{
  status: string
  provider: string
  method: string
}> {
  return request<{ status: string; provider: string; method: string }>(
    "/api/oauth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github-copilot", method: "gh_cli" }),
    },
  )
}

export async function importCodexCLI(): Promise<{
  status: string
  provider: string
  method: string
}> {
  return request<{ status: string; provider: string; method: string }>(
    "/api/oauth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai", method: "codex_cli" }),
    },
  )
}

export async function importClaudeCode(): Promise<{
  status: string
  provider: string
  method: string
}> {
  return request<{ status: string; provider: string; method: string }>(
    "/api/oauth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "anthropic", method: "claude_code" }),
    },
  )
}

export async function logoutOAuth(
  provider: OAuthProvider,
): Promise<{ status: string; provider: OAuthProvider }> {
  return request<{ status: string; provider: OAuthProvider }>(
    "/api/oauth/logout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    },
  )
}
