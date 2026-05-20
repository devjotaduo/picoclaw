import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type WhatsAppInternalNote,
  addWhatsAppNote,
  deleteWhatsAppNote,
  listWhatsAppNotes,
} from "@/api/whatsapp"
import {
  type InternalNote,
  internalNotesStore,
  addNote as localAddNote,
  listNotes as localListNotes,
  removeNote as localRemoveNote,
} from "@/lib/whatsapp/internal-notes"

export type { InternalNote }

export interface UseInternalNotesResult {
  notes: InternalNote[]
  /** True while the backend endpoint isn't available — UI may show a hint. */
  localOnly: boolean
  addNote: (input: { content: string; author: string }) => void
  removeNote: (id: string | number) => void
}

const notesQueryKey = (jid: string) => ["whatsapp", "notes", jid]

function toLocalShape(server: WhatsAppInternalNote): InternalNote {
  return {
    id: `srv-${server.id}`,
    chat_jid: server.chat_jid,
    content: server.content,
    author: server.author,
    ts: server.ts,
  }
}

/**
 * Subscribes to internal notes for a chat. Prefers the backend (synced
 * across tabs/users) but falls back to localStorage when the endpoint
 * returns 404 — older launchers without the `wa_internal_notes` table
 * remain usable on a single device.
 */
export function useInternalNotes(
  chatJID: string | null,
): UseInternalNotesResult {
  const queryClient = useQueryClient()
  const [localOnly, setLocalOnly] = useState(false)
  const [localFallback, setLocalFallback] = useState<InternalNote[]>(() =>
    chatJID ? localListNotes(chatJID) : [],
  )

  const query = useQuery({
    queryKey: notesQueryKey(chatJID ?? ""),
    queryFn: async () => {
      try {
        return await listWhatsAppNotes(chatJID ?? "")
      } catch (err) {
        // Trip the localStorage fallback on 404 / network failure so dev
        // dashboards without the backend update keep working.
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes("404") || message.includes("Failed to fetch")) {
          setLocalOnly(true)
          return []
        }
        throw err
      }
    },
    enabled: !!chatJID,
    staleTime: 30_000,
  })

  // Mirror localStorage changes (used only when in fallback mode).
  useEffect(() => {
    if (!chatJID || !localOnly) return
    setLocalFallback(localListNotes(chatJID))
    return internalNotesStore.subscribe(() => {
      setLocalFallback(localListNotes(chatJID))
    })
  }, [chatJID, localOnly])

  const addMutation = useMutation({
    mutationFn: async (input: { content: string; author: string }) => {
      if (!chatJID) throw new Error("no chat selected")
      return addWhatsAppNote({ jid: chatJID, ...input })
    },
    onSuccess: (saved) => {
      if (!chatJID) return
      queryClient.setQueryData<WhatsAppInternalNote[]>(
        notesQueryKey(chatJID),
        (prev) => [saved, ...(prev ?? [])],
      )
    },
    onError: () => {
      // Backend offline — degrade to localStorage so the operator doesn't
      // lose what they typed.
      setLocalOnly(true)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!chatJID) throw new Error("no chat selected")
      return deleteWhatsAppNote(chatJID, id)
    },
    onSuccess: (_, id) => {
      if (!chatJID) return
      queryClient.setQueryData<WhatsAppInternalNote[]>(
        notesQueryKey(chatJID),
        (prev) => prev?.filter((n) => n.id !== id) ?? prev,
      )
    },
  })

  const notes = useMemo<InternalNote[]>(() => {
    if (localOnly) return localFallback
    return (query.data ?? []).map(toLocalShape)
  }, [localOnly, localFallback, query.data])

  const addNote = useCallback(
    (input: { content: string; author: string }) => {
      if (!chatJID) return
      if (localOnly) {
        localAddNote({ chatJID, ...input })
        return
      }
      addMutation.mutate(input)
    },
    [addMutation, chatJID, localOnly],
  )

  const removeNote = useCallback(
    (id: string | number) => {
      if (localOnly) {
        localRemoveNote(typeof id === "string" ? id : String(id))
        return
      }
      // Server ids carry the "srv-" prefix in the local shape — strip it.
      const raw = typeof id === "string" ? id.replace(/^srv-/, "") : id
      const numeric = typeof raw === "number" ? raw : parseInt(raw, 10)
      if (Number.isFinite(numeric)) deleteMutation.mutate(numeric)
    },
    [deleteMutation, localOnly],
  )

  return { notes, localOnly, addNote, removeNote }
}
