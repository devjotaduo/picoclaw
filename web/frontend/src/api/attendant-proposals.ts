/**
 * Attendant config proposals API client (v2.0 approval-always flow).
 *
 * The assistant agent stages a proposed change to the attendant agent's
 * configuration; the tenant owner approves or rejects it here. Approval replays
 * the proposal payload through the same apply path the dashboard editor uses
 * (POST /api/agent/templates/apply core), so there is exactly one apply path.
 *
 * Endpoint: launcher backend at /api/attendant-proposals (not controlplane).
 * Cookies are sent automatically (same-origin); mirrors the notifications API.
 */

export type ProposalStatus = "pending" | "approved" | "rejected"

export interface AttendantProposal {
  id: string
  /** Agent being reconfigured (normalized id, e.g. "main"). */
  target_id: string
  /** Agent that staged the proposal (e.g. "assistente"). */
  proposed_by?: string
  /** One-line human description shown on the approval card. */
  summary: string
  /** Optional rationale for the change. */
  reason?: string
  status: ProposalStatus
  /** Full apply payload replayed on approval. Loosely typed: the card only
   *  renders summary/reason/target; the backend owns payload validation. */
  payload?: unknown
  /** ISO timestamp. */
  created_at: string
  /** ISO timestamp once decided; null/undefined while pending. */
  decided_at?: string | null
}

export interface AttendantProposalListResponse {
  proposals: AttendantProposal[]
}

export interface AttendantProposalDecisionResponse {
  proposal: AttendantProposal
  applied: boolean
  reload?: string
  warning?: string
}

const BASE = "/api/attendant-proposals"

export async function listAttendantProposals(
  opts: { pendingOnly?: boolean } = {},
): Promise<AttendantProposalListResponse> {
  const params = new URLSearchParams()
  if (opts.pendingOnly) params.set("pending", "true")
  const q = params.toString()
  const res = await fetch(q ? `${BASE}?${q}` : BASE, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`attendant proposals list: HTTP ${res.status}`)
  }
  return (await res.json()) as AttendantProposalListResponse
}

export async function approveAttendantProposal(
  id: string,
): Promise<AttendantProposalDecisionResponse> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.text()
      if (body) detail = body
    } catch {
      // ignore — keep the status-based message
    }
    throw new Error(`attendant proposal approve: ${detail}`)
  }
  return (await res.json()) as AttendantProposalDecisionResponse
}

export async function rejectAttendantProposal(
  id: string,
): Promise<AttendantProposalDecisionResponse> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/reject`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(`attendant proposal reject: HTTP ${res.status}`)
  }
  return (await res.json()) as AttendantProposalDecisionResponse
}
