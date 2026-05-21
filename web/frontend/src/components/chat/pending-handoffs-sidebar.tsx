import {
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconClipboardCheck,
  IconInbox,
  IconUserCheck,
  IconUsers,
} from "@tabler/icons-react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import {
  type CompanyOnboardingItem,
  getCompanyOnboardingStatus,
} from "@/api/company-onboarding"
import {
  type WhatsAppChat,
  type WhatsAppConversationInsight,
  getWhatsAppConversationInsight,
  listWhatsAppChats,
} from "@/api/whatsapp"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { formatJID, formatRelativeTS } from "@/lib/whatsapp/format"
import { truncatePreview } from "@/lib/whatsapp/quote"

const QUERY_KEY = ["whatsapp", "chats", "handoffs-and-leads"] as const
const INSIGHT_SCAN_LIMIT = 24
const CARD_ITEM_LIMIT = 5
const COMPANY_ONBOARDING_FALLBACK: CompanyOnboardingItem[] = [
  {
    id: "name",
    title: "Nome da empresa",
    description: "Informe o nome real que os agentes podem usar.",
    source: "Dados da empresa",
    completed: false,
  },
  {
    id: "segment",
    title: "Tipo de negócio",
    description: "Ex.: loja, clínica ou restaurante.",
    source: "Dados da empresa",
    completed: false,
  },
  {
    id: "products",
    title: "Produtos ou serviços",
    description: "Liste o que pode ser explicado aos clientes.",
    source: "Dados da empresa",
    completed: false,
  },
  {
    id: "payment",
    title: "Pagamento e preços",
    description: "Defina formas de pagamento e o que pode falar sobre preço.",
    source: "Dados da empresa",
    completed: false,
  },
  {
    id: "channels",
    title: "Canais autorizados",
    description: "Confirme os números e grupos onde os agentes podem atuar.",
    source: "Canais autorizados",
    completed: false,
  },
]

type SidebarConversationKind = "human" | "lead"

interface SidebarConversationItem {
  kind: SidebarConversationKind
  chat: WhatsAppChat
  insight?: WhatsAppConversationInsight
}

function getChatDisplayName(chat: WhatsAppChat): string {
  return (
    chat.display_name?.trim() || chat.push_name?.trim() || formatJID(chat.jid)
  )
}

function chatInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return "C"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function isLeadInsight(insight?: WhatsAppConversationInsight): boolean {
  if (!insight) return false

  const stage = (insight.lead_stage || "").toLowerCase()
  const priority = (insight.priority || "").toLowerCase()

  return (
    stage === "lead" ||
    stage === "qualified" ||
    stage === "nurturing" ||
    priority === "high" ||
    priority === "urgent"
  )
}

function leadLabel(insight?: WhatsAppConversationInsight): string {
  const stage = (insight?.lead_stage || "").toLowerCase()

  if (stage === "qualified") return "Lead qualificado"
  if (stage === "nurturing") return "Em nutrição"
  if (stage === "lead") return "Lead"
  return "Lead"
}

function itemSubtitle(item: SidebarConversationItem): string {
  if (item.kind === "human") {
    return item.chat.last_preview
      ? truncatePreview(item.chat.last_preview, 46)
      : "Transferida para humano"
  }

  return (
    item.insight?.summary?.trim() ||
    item.chat.last_preview?.trim() ||
    leadLabel(item.insight)
  )
}

function rowTone(kind: SidebarConversationKind, index: number) {
  if (kind === "human") {
    return index === 0
      ? "bg-amber-500/18 text-amber-300 ring-amber-400/25"
      : "bg-amber-500/10 text-amber-300 ring-amber-400/15"
  }

  return index === 0
    ? "bg-emerald-500/18 text-emerald-300 ring-emerald-400/25"
    : "bg-emerald-500/10 text-emerald-300 ring-emerald-400/15"
}

export function PendingHandoffsSidebar({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listWhatsAppChats(150),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const chats = useMemo(() => data ?? [], [data])
  const insightSource = useMemo(
    () => chats.slice(0, INSIGHT_SCAN_LIMIT),
    [chats],
  )
  const insightQueries = useQueries({
    queries: insightSource.map((chat) => ({
      queryKey: ["whatsapp", "chat", chat.jid, "sidebar-insight"],
      queryFn: () => getWhatsAppConversationInsight(chat.jid),
      retry: false,
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  })

  const { humanItems, leadItems, visibleItems } = useMemo(() => {
    const insightByJid = new Map<string, WhatsAppConversationInsight>()

    insightQueries.forEach((query, index) => {
      const jid = insightSource[index]?.jid
      if (jid && query.data) {
        insightByJid.set(jid, query.data)
      }
    })

    const humans = chats
      .filter((chat) => chat.paused)
      .map<SidebarConversationItem>((chat) => ({
        kind: "human",
        chat,
        insight: insightByJid.get(chat.jid),
      }))
      .sort((a, b) => b.chat.last_message_ts - a.chat.last_message_ts)

    const hasInsightData = insightByJid.size > 0
    const leads = chats
      .filter((chat) => !chat.paused)
      .map<SidebarConversationItem>((chat) => ({
        kind: "lead",
        chat,
        insight: insightByJid.get(chat.jid),
      }))
      .filter((item) => {
        if (hasInsightData) {
          return isLeadInsight(item.insight)
        }
        return item.chat.unread_count > 0 || item.chat.last_direction === "in"
      })
      .sort((a, b) => b.chat.last_message_ts - a.chat.last_message_ts)

    return {
      humanItems: humans,
      leadItems: leads,
      visibleItems: [...humans, ...leads]
        .sort((a, b) => b.chat.last_message_ts - a.chat.last_message_ts)
        .slice(0, CARD_ITEM_LIMIT),
    }
  }, [chats, insightQueries, insightSource])

  return (
    <aside
      className={cn(
        "border-border/40 bg-background/60 flex h-full w-72 shrink-0 flex-col gap-3 border-l p-3",
        className,
      )}
      aria-label="Conversas importantes"
    >
      <section className="bg-card text-card-foreground flex max-h-[50%] min-h-0 basis-1/2 flex-col overflow-hidden rounded-3xl border p-3 shadow-sm">
        <div className="bg-muted/60 mb-3 flex items-center gap-2 rounded-full p-1">
          <span className="bg-background text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold shadow-sm">
            <IconUsers className="size-3.5" />
            Humano
            <span className="text-muted-foreground text-[10px]">
              {humanItems.length}
            </span>
          </span>
          <span className="text-muted-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold">
            <IconUserCheck className="size-3.5" />
            Leads
            <span className="text-muted-foreground text-[10px]">
              {leadItems.length}
            </span>
          </span>
        </div>

        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Conversas
            </p>
          </div>
          <Link
            to="/agent/whatsapp"
            className="text-muted-foreground hover:text-foreground pb-0.5 text-[11px] font-semibold underline-offset-4 hover:underline"
          >
            Ver tudo
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {isLoading && (
            <div className="text-muted-foreground px-2 py-6 text-xs">
              Carregando conversas...
            </div>
          )}

          {!isLoading && visibleItems.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center justify-center px-3 py-10 text-center text-xs">
              <IconInbox className="mb-2 size-6 opacity-50" />
              <p>Nenhuma conversa para humano ou lead agora.</p>
            </div>
          )}

          <ul className="space-y-2">
            {visibleItems.map((item, index) => (
              <PendingConversationRow
                key={`${item.kind}:${item.chat.jid}`}
                item={item}
                index={index}
              />
            ))}
          </ul>
        </div>
      </section>
      <CompanyOnboardingCard className="min-h-0 flex-1" />
    </aside>
  )
}

function CompanyOnboardingCard({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["workspace", "company-onboarding"],
    queryFn: getCompanyOnboardingStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  })
  const items = data?.items ?? COMPANY_ONBOARDING_FALLBACK
  const visibleItems = items.filter((item) => !item.completed)
  const total = data?.total ?? items.length
  const completed =
    data?.completed ?? items.filter((item) => item.completed).length
  const missing = data?.missing ?? visibleItems.length
  const [openItemID, setOpenItemID] = useState<string | null>(
    () => visibleItems[0]?.id ?? null,
  )
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const firstOpenID = openItemID ?? visibleItems[0]?.id ?? null

  return (
    <section
      className={cn(
        "bg-card text-card-foreground flex flex-col overflow-hidden rounded-3xl border p-3 shadow-sm",
        className,
      )}
      aria-label="Dados pendentes da empresa"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
            Onboarding
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CircularOnboardingProgress progress={progress} />
          <span className="text-muted-foreground text-[10px] font-semibold">
            {missing} faltando
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {isLoading && (
          <div className="text-muted-foreground px-2 py-6 text-xs">
            Verificando dados...
          </div>
        )}

        {!isLoading && visibleItems.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center justify-center px-3 py-8 text-center text-xs">
            <IconClipboardCheck className="mb-2 size-6 opacity-50" />
            <p>Dados principais preenchidos.</p>
          </div>
        )}

        <div className="flex flex-col">
          {visibleItems.map((item, index) => (
            <OnboardingStepRow
              key={item.id}
              item={item}
              open={firstOpenID === item.id}
              separated={index > 0}
              onOpen={() =>
                setOpenItemID((current) =>
                  current === item.id ? null : item.id,
                )
              }
            />
          ))}
        </div>
      </div>

      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-3 h-8 rounded-full text-xs"
      >
        <Link to="/sofia-onboarding">Completar com Sofia</Link>
      </Button>
    </section>
  )
}

function CircularOnboardingProgress({ progress }: { progress: number }) {
  const dashOffset = 100 - progress

  return (
    <svg
      className="-rotate-90"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      aria-hidden="true"
    >
      <circle
        className="stroke-muted"
        cx="9"
        cy="9"
        fill="none"
        pathLength="100"
        r="7"
        strokeWidth="2"
      />
      <circle
        className="stroke-primary"
        cx="9"
        cy="9"
        fill="none"
        pathLength="100"
        r="7"
        strokeDasharray="100"
        strokeLinecap="round"
        strokeWidth="2"
        style={{ strokeDashoffset: dashOffset }}
      />
    </svg>
  )
}

function OnboardingStepRow({
  item,
  open,
  separated,
  onOpen,
}: {
  item: CompanyOnboardingItem
  open: boolean
  separated: boolean
  onOpen: () => void
}) {
  return (
    <div className={cn(separated && "border-border/60 border-t")}>
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring flex w-full items-start gap-2 rounded-2xl px-2 py-2 text-left outline-none focus-visible:ring-2",
          open && "bg-muted/70",
        )}
        onClick={onOpen}
      >
        {item.completed ? (
          <IconCircleCheckFilled className="text-primary mt-0.5 size-4 shrink-0" />
        ) : (
          <IconCircleDashed className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-xs font-semibold">
            {item.title}
          </span>
          <Collapsible open={open}>
            <CollapsibleContent>
              <span className="text-muted-foreground mt-2 block text-[11px] leading-4">
                {item.description}
              </span>
            </CollapsibleContent>
          </Collapsible>
        </span>
        {!open && (
          <IconChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
      </button>
    </div>
  )
}

function PendingConversationRow({
  item,
  index,
}: {
  item: SidebarConversationItem
  index: number
}) {
  const name = getChatDisplayName(item.chat)
  const subtitle = itemSubtitle(item)
  const tone = rowTone(item.kind, index)

  return (
    <li>
      <Link
        to="/agent/whatsapp"
        search={{ jid: item.chat.jid }}
        className="hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-2 rounded-2xl px-1.5 py-1.5 transition outline-none focus-visible:ring-2"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1",
            tone,
          )}
        >
          {index < 3 ? index + 1 : `#${index + 1}`}
        </span>
        <span className="bg-muted relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold">
          {item.chat.avatar_url ? (
            <img
              src={item.chat.avatar_url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            chatInitials(name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-xs font-semibold">
            {name}
          </span>
          <span className="text-muted-foreground mt-0.5 block truncate text-[11px] leading-4">
            {subtitle}
          </span>
        </span>
        <span className="text-muted-foreground/90 shrink-0 text-[10px] font-semibold">
          {formatRelativeTS(item.chat.last_message_ts)}
        </span>
      </Link>
    </li>
  )
}
