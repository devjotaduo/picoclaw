/**
 * useLeads — deriva uma lista de leads a partir de sinais que os agentes já
 * produzem, SEM endpoint dedicado. Combina duas fontes:
 *
 *  1. Notificações (`useNotifications`) disparadas pela Marcos/vendas ou que
 *     mencionem lead/oportunidade/proposta.
 *  2. Items do painel dos agentes (`useAgentDashboard`) atribuídos a vendas ou
 *     marcados com tag/termo de lead.
 *
 * Quando existir um `GET /api/leads` real (lendo memory/leads.md), basta trocar
 * a implementação deste hook — os consumidores (leads-card) só dependem do
 * shape `LeadSignal`.
 */
import { useMemo } from "react"

import type { AgentDashboardItem } from "@/api/agent-dashboard"
import type { Notification } from "@/api/notifications"
import { useAgentDashboard } from "@/hooks/use-agent-dashboard"
import { useNotifications } from "@/hooks/use-notifications"
import { dashboardItemStamp, friendlyAgentName } from "@/lib/agent-dashboard"

export type LeadTemperature = "hot" | "warm" | "cold" | "unknown"

export interface LeadSignal {
  id: string
  title: string
  body?: string
  agentName?: string
  ctaUrl?: string
  stamp: string
  temperature: LeadTemperature
  source: "notification" | "dashboard"
}

const SALES_AGENT_TOKENS = ["marcos", "vendas", "sales", "comercial"]
const LEAD_TERMS =
  /\b(lead|leads|oportunidade|prospec|propost|or[çc]ament|quente|morno|frio|fechar|negocia|cota[çc][aã]o)/i

function detectTemperature(text: string): LeadTemperature {
  const lower = text.toLowerCase()
  if (/\bquente|hot\b/.test(lower)) return "hot"
  if (/\bmorno|warm\b/.test(lower)) return "warm"
  if (/\bfrio|cold\b/.test(lower)) return "cold"
  return "unknown"
}

function mentionsSalesAgent(value?: string): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return SALES_AGENT_TOKENS.some((token) => lower.includes(token))
}

function notificationToLead(n: Notification): LeadSignal | null {
  const haystack = `${n.title} ${n.body ?? ""} ${n.agent_id ?? ""}`
  const isSales = mentionsSalesAgent(n.agent_id) || mentionsSalesAgent(n.title)
  if (!isSales && !LEAD_TERMS.test(haystack)) {
    return null
  }
  return {
    id: `notif:${n.id}`,
    title: n.title,
    body: n.body,
    agentName: n.agent_id
      ? friendlyAgentName({ agent_id: n.agent_id })
      : undefined,
    ctaUrl: n.cta_url,
    stamp: n.created_at,
    temperature: detectTemperature(haystack),
    source: "notification",
  }
}

function dashboardItemToLead(item: AgentDashboardItem): LeadSignal | null {
  const haystack = `${item.title} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")}`
  const isSales =
    mentionsSalesAgent(item.agent_id) ||
    mentionsSalesAgent(item.agent_name) ||
    mentionsSalesAgent(item.source)
  const tagged = (item.tags ?? []).some((tag) => LEAD_TERMS.test(tag))
  if (!isSales && !tagged && !LEAD_TERMS.test(haystack)) {
    return null
  }
  return {
    id: `dash:${item.source}:${item.id}`,
    title: item.title,
    body: item.summary,
    agentName: friendlyAgentName(item),
    stamp: dashboardItemStamp(item),
    temperature: detectTemperature(haystack),
    source: "dashboard",
  }
}

export function useLeads() {
  const { notifications, isLoading: notifLoading } = useNotifications()
  const { items, isLoading: dashLoading } = useAgentDashboard()

  const leads = useMemo<LeadSignal[]>(() => {
    const fromNotifications = notifications
      .map(notificationToLead)
      .filter((lead): lead is LeadSignal => lead !== null)
    const fromDashboard = items
      .map(dashboardItemToLead)
      .filter((lead): lead is LeadSignal => lead !== null)

    const merged = [...fromNotifications, ...fromDashboard]
    // Dedup por título normalizado: o mesmo lead às vezes vem como notificação
    // E como item do painel.
    const seen = new Set<string>()
    const unique = merged.filter((lead) => {
      const key = lead.title.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return unique.sort((a, b) => b.stamp.localeCompare(a.stamp))
  }, [items, notifications])

  return {
    leads,
    isLoading: notifLoading || dashLoading,
  }
}
