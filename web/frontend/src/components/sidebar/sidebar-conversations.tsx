/**
 * SidebarConversations — lista de conversas com scroll infinito na sidebar,
 * estilo Claude/ChatGPT: busca no topo, agrupamento por data (Hoje / Ontem /
 * 7 dias / Antigas), botão "Nova conversa". Reusa useSessionHistory (já
 * paginado + IntersectionObserver) e o controller de chat.
 *
 * Gated por `sidebar.conversations` no app-sidebar.
 */
import { IconPlus, IconSearch, IconTrash } from "@tabler/icons-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import dayjs from "dayjs"
import { useAtomValue } from "jotai"
import * as React from "react"

import type { SessionSummary } from "@/api/sessions"
import { newChatSession, switchChatSession } from "@/features/chat/controller"
import { useSessionHistory } from "@/hooks/use-session-history"
import { cn } from "@/lib/utils"
import { chatAtom } from "@/store/chat"

interface DateBucket {
  label: string
  sessions: SessionSummary[]
}

function bucketSessions(sessions: SessionSummary[]): DateBucket[] {
  const now = dayjs()
  const buckets: Record<string, SessionSummary[]> = {
    Hoje: [],
    Ontem: [],
    "Últimos 7 dias": [],
    Anteriores: [],
  }

  for (const session of sessions) {
    const updated = dayjs(session.updated)
    if (updated.isSame(now, "day")) {
      buckets["Hoje"].push(session)
    } else if (updated.isSame(now.subtract(1, "day"), "day")) {
      buckets["Ontem"].push(session)
    } else if (updated.isAfter(now.subtract(7, "day"))) {
      buckets["Últimos 7 dias"].push(session)
    } else {
      buckets["Anteriores"].push(session)
    }
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, sessions: items }))
}

export function SidebarConversations() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const activeSessionId = useAtomValue(chatAtom).activeSessionId
  const [search, setSearch] = React.useState("")

  const {
    sessions,
    hasMore,
    loadError,
    loadErrorMessage,
    observerRef,
    loadSessions,
    handleDeleteSession,
  } = useSessionHistory({
    activeSessionId,
    onDeletedActiveSession: () => {
      void newChatSession()
    },
  })

  // useSessionHistory não carrega sozinho (o menu legado dispara no open). Como
  // a lista aqui é sempre visível na sidebar, fazemos a carga inicial no mount.
  React.useEffect(() => {
    void loadSessions(true)
    // Carregar uma vez no mount; loadSessions muda de identidade a cada offset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sessions
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        s.preview.toLowerCase().includes(term),
    )
  }, [search, sessions])

  const buckets = React.useMemo(() => bucketSessions(filtered), [filtered])

  const handleNew = React.useCallback(() => {
    void newChatSession()
    void navigate({ to: "/" })
  }, [navigate])

  const handleOpen = React.useCallback(
    (id: string) => {
      void switchChatSession(id)
      if (routerState.location.pathname !== "/") {
        void navigate({ to: "/" })
      }
    },
    [navigate, routerState.location.pathname],
  )

  const onChatPage = routerState.location.pathname === "/"

  return (
    <div className="flex min-h-0 flex-col px-2 pt-1">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-muted-foreground/70 text-[10px] font-semibold tracking-[0.14em] uppercase">
          Conversas
        </span>
        <button
          type="button"
          onClick={handleNew}
          aria-label="Nova conversa"
          title="Nova conversa"
          className="text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
        >
          <IconPlus className="size-3.5" />
        </button>
      </div>

      <div className="relative mb-1.5 px-1">
        <IconSearch className="text-muted-foreground/40 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar conversas"
          className="bg-muted/40 placeholder:text-muted-foreground/50 focus-visible:ring-ring/40 h-7 w-full rounded-md border-0 pr-2 pl-7 text-[12px] outline-none focus-visible:ring-2"
        />
      </div>

      {loadError ? (
        <p className="text-destructive px-2 py-3 text-[11px]">
          {loadErrorMessage}
        </p>
      ) : buckets.length === 0 ? (
        <p className="text-muted-foreground/50 px-2 py-3 text-[11px]">
          {search ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
        </p>
      ) : (
        <div className="space-y-2">
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <p className="text-muted-foreground/45 sticky top-0 px-2 py-1 text-[10px] font-medium">
                {bucket.label}
              </p>
              <ul>
                {bucket.sessions.map((session) => (
                  <ConversationRow
                    key={session.id}
                    session={session}
                    isActive={onChatPage && session.id === activeSessionId}
                    onOpen={() => handleOpen(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
          {hasMore && filtered.length > 0 && !search ? (
            <div ref={observerRef} className="py-2 text-center">
              <span className="text-muted-foreground/40 animate-pulse text-[10px]">
                Carregando…
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ConversationRow({
  session,
  isActive,
  onOpen,
  onDelete,
}: {
  session: SessionSummary
  isActive: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <li
      className={cn(
        "group/conv relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        isActive ? "bg-accent/80" : "hover:bg-muted/50",
      )}
      onClick={onOpen}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px] leading-tight",
            isActive ? "text-foreground font-medium" : "text-foreground/80",
          )}
        >
          {session.title}
        </span>
      </span>
      <button
        type="button"
        aria-label="Apagar conversa"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete()
        }}
        className="text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive invisible shrink-0 rounded p-0.5 transition-colors group-hover/conv:visible"
      >
        <IconTrash className="size-3.5" />
      </button>
    </li>
  )
}
