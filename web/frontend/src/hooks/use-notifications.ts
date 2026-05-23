/**
 * useNotifications — hook reativo pra notificações do tenant.
 *
 * MVP: polling a cada 15s via React Query, com optimistic update no
 * mark-as-read. Inspirado nos padrões do chat-sdk.dev/useChat (state
 * machine + optimistic mutations) mas sem streaming — SSE virá depois
 * em iteração separada.
 *
 * Gracefully degrada: se o backend ainda não tiver o endpoint montado
 * (404/500), retorna lista vazia em vez de quebrar a UI. Operadores
 * acompanham via console.warn.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationListResponse,
} from "@/api/notifications"

const QUERY_KEY = ["notifications", "list"] as const
const POLL_INTERVAL_MS = 15_000

const EMPTY_RESPONSE: NotificationListResponse = {
  notifications: [],
  unread_count: 0,
}

export function useNotifications(opts: { unreadOnly?: boolean } = {}) {
  const queryClient = useQueryClient()

  const query = useQuery<NotificationListResponse>({
    queryKey: opts.unreadOnly ? [...QUERY_KEY, "unread"] : QUERY_KEY,
    queryFn: async () => {
      try {
        return await listNotifications({ unreadOnly: opts.unreadOnly, limit: 50 })
      } catch (err) {
        // Backend ainda pode não estar montado — não quebra a UI, só loga.
        console.warn("[notifications] fetch falhou, retornando vazio:", err)
        return EMPTY_RESPONSE
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS / 2,
    retry: false,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    // Optimistic update: marca como lida na lista local antes do round-trip.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationListResponse>(QUERY_KEY)
      if (previous) {
        const now = new Date().toISOString()
        queryClient.setQueryData<NotificationListResponse>(QUERY_KEY, {
          notifications: previous.notifications.map((n) =>
            n.id === id && !n.read_at ? { ...n, read_at: now } : n,
          ),
          unread_count: Math.max(0, previous.unread_count - 1),
        })
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationListResponse>(QUERY_KEY)
      if (previous) {
        const now = new Date().toISOString()
        queryClient.setQueryData<NotificationListResponse>(QUERY_KEY, {
          notifications: previous.notifications.map((n) =>
            n.read_at ? n : { ...n, read_at: now },
          ),
          unread_count: 0,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationListResponse>(QUERY_KEY)
      if (previous) {
        const filtered = previous.notifications.filter((n) => n.id !== id)
        const removedUnread = previous.notifications.some(
          (n) => n.id === id && !n.read_at,
        )
        queryClient.setQueryData<NotificationListResponse>(QUERY_KEY, {
          notifications: filtered,
          unread_count: Math.max(0, previous.unread_count - (removedUnread ? 1 : 0)),
        })
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const handleMarkRead = useCallback(
    (n: Notification) => {
      if (n.read_at) return
      markRead.mutate(n.id)
    },
    [markRead],
  )

  const handleDismiss = useCallback((id: string) => dismiss.mutate(id), [dismiss])
  const handleMarkAllRead = useCallback(
    () => markAllRead.mutate(),
    [markAllRead],
  )

  const data = query.data ?? EMPTY_RESPONSE

  return {
    notifications: data.notifications,
    unreadCount: data.unread_count,
    isLoading: query.isLoading,
    isError: query.isError,
    markRead: handleMarkRead,
    markAllRead: handleMarkAllRead,
    dismiss: handleDismiss,
    refetch: query.refetch,
  }
}
