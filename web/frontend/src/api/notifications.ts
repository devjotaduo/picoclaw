/**
 * Notifications API client.
 *
 * Notificações curtas que os agentes do tenant disparam para o usuário.
 * Tipos cobertos: data (atualização ou número), warning (algo a olhar),
 * billing (cobrança / limite). O agente principal (Rafael) ou qualquer
 * sub-agente (pixel/doc/dev) pode disparar via a tool `notify_user` no
 * pkg/tools/notify_user.go — esta API só lê + marca como lida.
 *
 * Endpoint: launcher backend em /api/notifications (não controlplane).
 * Padrão de polling no use-notifications.ts; SSE virá em iteração futura.
 */

export type NotificationKind = "data" | "warning" | "billing"

export interface Notification {
  id: string
  kind: NotificationKind
  /** Título curto (até ~60 chars). */
  title: string
  /** Corpo opcional (até ~200 chars). */
  body?: string
  /** Quem disparou — exibido como atribuição: "via Pixel". */
  agent_id?: string
  /** Link opcional pra um detalhe externo (ex: relatório, fatura). */
  cta_url?: string
  cta_label?: string
  /** ISO timestamp. */
  created_at: string
  /** Null = não lida. ISO timestamp = lida em. */
  read_at: string | null
}

export interface NotificationListResponse {
  notifications: Notification[]
  /** Total de não-lidas (para badge no header do painel). */
  unread_count: number
}

const BASE = "/api/notifications"

export async function listNotifications(
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationListResponse> {
  const params = new URLSearchParams()
  if (opts.unreadOnly) params.set("unread", "true")
  if (opts.limit) params.set("limit", String(opts.limit))
  const q = params.toString()
  const res = await fetch(q ? `${BASE}?${q}` : BASE, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`notifications list: HTTP ${res.status}`)
  }
  return (await res.json()) as NotificationListResponse
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/read`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(`notifications mark-read: HTTP ${res.status}`)
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${BASE}/read-all`, { method: "POST" })
  if (!res.ok) {
    throw new Error(`notifications mark-all-read: HTTP ${res.status}`)
  }
}

export async function dismissNotification(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new Error(`notifications dismiss: HTTP ${res.status}`)
  }
}
