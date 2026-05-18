import {
  IconDeviceFloppy,
  IconFileDescription,
  IconHeadset,
  IconPhoto,
  IconRefresh,
  IconRobot,
  IconSend,
  IconShield,
  IconSparkles,
  IconTargetArrow,
  IconUserShield,
  IconWorldWww,
} from "@tabler/icons-react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type {
  AgentSummary,
  InternalAgentsResponse,
} from "@/api/internal-agents"
import {
  getInternalAgentProposals,
  getInternalAgents,
  sendInternalAgentTurn,
  updateInternalAgentOrchestration,
} from "@/api/internal-agents"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

type AgentProfileDraft = {
  name: string
  icon: string
  initials: string
  background: string
  foreground: string
  imageURL: string
}

type RoleConfigDraft = Record<string, unknown>

type MarketingRoleConfig = {
  platforms?: string[]
  deliverables?: string[]
  approval_mode?: string
  public_publish_dir?: string
  brand_kit?: {
    colors?: string[]
    fonts?: string[]
    tone?: string
    visual_style?: string
  }
  content_pillars?: string[]
  audiences?: unknown[]
  cadence?: {
    posts_per_week?: number
    campaigns_per_month?: number
    planning_horizon?: string
  }
  trend_sources?: string[]
  competitors?: string[]
  default_image_sizes?: Record<string, string>
  requires_human_review?: boolean
}

type SalesRoleConfig = {
  funnel_stages?: string[]
  qualification_fields?: string[]
  followup_cadence?: string[]
  crm_integration?: string
  price_policy_source?: string
  handoff_rules?: string[]
}

type AttendantRoleConfig = {
  departments?: string[]
  triage_fields?: string[]
  escalation_rules?: string[]
  scheduling_enabled?: boolean
  faq_source?: string
}

type AssistantRoleConfig = {
  authorized_scopes?: string[]
  report_cadence?: string[]
  can_edit_agents?: boolean
  can_call_agents?: string[]
  requires_confirmation?: string[]
  audit_level?: string
}

const defaultAvatarByAgent: Record<string, AgentProfileDraft> = {
  main: {
    name: "Ana",
    icon: "headset",
    initials: "AN",
    background: "#2563eb",
    foreground: "#ffffff",
    imageURL: "",
  },
  vendas: {
    name: "Leo",
    icon: "target",
    initials: "LE",
    background: "#16a34a",
    foreground: "#ffffff",
    imageURL: "",
  },
  marketing: {
    name: "Maya",
    icon: "sparkles",
    initials: "MA",
    background: "#f43f5e",
    foreground: "#ffffff",
    imageURL: "",
  },
  assistente: {
    name: "Sofia",
    icon: "assistant",
    initials: "SO",
    background: "#7c3aed",
    foreground: "#ffffff",
    imageURL: "",
  },
}

const quickPromptsByAgent: Record<
  string,
  Array<{ icon: React.ElementType; label: string; prompt: string }>
> = {
  marketing: [
    {
      icon: IconWorldWww,
      label: "Testar site",
      prompt:
        "Crie um site simples de uma página para uma empresa fictícia chamada Studio Solar, com hero, benefícios, planos sob consulta e contato pelo WhatsApp a confirmar. Salve em public/marketing/site-studio-solar.html e registre proposta kind site.",
    },
    {
      icon: IconFileDescription,
      label: "Testar catálogo",
      prompt:
        "Crie um catálogo HTML simples para a empresa fictícia Café Aurora com 3 produtos: Espresso R$8, Capuccino R$12 e Cold Brew R$15. Salve em public/marketing/catalogo-cafe-aurora.html e registre proposta kind catalog.",
    },
    {
      icon: IconPhoto,
      label: "Campanha",
      prompt:
        "Crie uma campanha curta para Instagram para uma empresa fictícia de serviços locais, com ideia visual, legenda, CTA e próximos passos. Não gere imagem agora.",
    },
  ],
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function lines(value?: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : ""
}

function parseRoleConfigDraft(draft: string): RoleConfigDraft | null {
  try {
    const parsed = JSON.parse(draft || "{}") as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    return parsed as RoleConfigDraft
  } catch {
    return null
  }
}

function proposalKind(proposal: unknown): string {
  if (!proposal || typeof proposal !== "object") return ""
  const record = proposal as Record<string, unknown>
  const kind = record.kind
  return typeof kind === "string" ? kind : ""
}

function proposalTitle(proposal: unknown): string {
  if (!proposal || typeof proposal !== "object") return "Proposta"
  const record = proposal as Record<string, unknown>
  for (const key of ["title", "name", "campaign_name"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return proposalKind(proposal) || "Proposta"
}

function proposalAssets(proposal: unknown): string[] {
  if (!proposal || typeof proposal !== "object") return []
  const assets = (proposal as Record<string, unknown>).asset_paths
  return Array.isArray(assets)
    ? assets.filter((item): item is string => typeof item === "string")
    : []
}

function proposalPublicURLs(proposal: unknown): string[] {
  if (!proposal || typeof proposal !== "object") return []
  const urls = (proposal as Record<string, unknown>).public_urls
  return Array.isArray(urls)
    ? urls.filter((item): item is string => typeof item === "string")
    : []
}

function profileDraftFromAgent(agent: AgentSummary): AgentProfileDraft {
  const fallback = defaultAvatarByAgent[agent.id] ?? {
    name: agent.name || agent.id,
    icon: "robot",
    initials: (agent.name || agent.id).slice(0, 2).toUpperCase(),
    background: "#475569",
    foreground: "#ffffff",
    imageURL: "",
  }
  return {
    name: agent.name || fallback.name,
    icon: agent.avatar?.icon || fallback.icon,
    initials: agent.avatar?.initials || fallback.initials,
    background: agent.avatar?.background || fallback.background,
    foreground: agent.avatar?.foreground || fallback.foreground,
    imageURL: agent.avatar?.image_url || fallback.imageURL,
  }
}

export function OrchestrationPage() {
  const { t } = useTranslation()
  const [data, setData] = React.useState<InternalAgentsResponse | null>(null)
  const [selectedAgentID, setSelectedAgentID] = React.useState("assistente")
  const [mainAgentID, setMainAgentID] = React.useState("main")
  const [mainAllowAgents, setMainAllowAgents] = React.useState<string[]>([])
  const [assistantJIDs, setAssistantJIDs] = React.useState("")
  const [assistantChats, setAssistantChats] = React.useState("")
  const [profiles, setProfiles] = React.useState<
    Record<string, AgentProfileDraft>
  >({})
  const [roleConfigDrafts, setRoleConfigDrafts] = React.useState<
    Record<string, string>
  >({})
  const [message, setMessage] = React.useState("")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [sessionID, setSessionID] = React.useState<string | undefined>()
  const [proposals, setProposals] = React.useState<unknown[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const next = await getInternalAgents()
      const nextMainAgentID =
        next.main_agent_id ||
        next.agents.find((agent) => agent.default)?.id ||
        "main"
      setData(next)
      setMainAgentID(nextMainAgentID)
      setMainAllowAgents(
        (next.main_allow_agents || []).filter((id) => id !== nextMainAgentID),
      )
      setAssistantJIDs(
        (next.assistant_whatsapp_jids || next.admin_whatsapp_jids || []).join(
          "\n",
        ),
      )
      setAssistantChats((next.assistant_whatsapp_chats || []).join("\n"))
      setProfiles(
        Object.fromEntries(
          next.agents.map((agent) => [agent.id, profileDraftFromAgent(agent)]),
        ),
      )
      setRoleConfigDrafts(
        Object.fromEntries(
          next.agents.map((agent) => [
            agent.id,
            JSON.stringify(agent.role_config ?? {}, null, 2),
          ]),
        ),
      )
      setSelectedAgentID((current) =>
        next.agents.some((agent) => agent.id === current)
          ? current
          : next.agents[0]?.id || "",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!selectedAgentID) {
      setProposals([])
      return
    }
    getInternalAgentProposals(selectedAgentID)
      .then(setProposals)
      .catch(() => setProposals([]))
  }, [selectedAgentID])

  const agents = data?.agents || []
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentID)
  const selectedProfile = selectedAgentID
    ? profiles[selectedAgentID]
    : undefined
  const selectedRoleConfigDraft = selectedAgentID
    ? roleConfigDrafts[selectedAgentID] || "{}"
    : "{}"
  const selectedRoleConfig = parseRoleConfigDraft(selectedRoleConfigDraft)
  const mainAgent = agents.find((agent) => agent.id === mainAgentID)
  const subagentOptions = agents.filter((agent) => agent.id !== mainAgentID)
  const quickPrompts = quickPromptsByAgent[selectedAgentID] || []

  const handleMainAgentChange = (agentID: string) => {
    setMainAgentID(agentID)
    setMainAllowAgents((current) => current.filter((id) => id !== agentID))
  }

  const toggleMainAllow = (agentID: string) => {
    setMainAllowAgents((current) =>
      current.includes(agentID)
        ? current.filter((id) => id !== agentID)
        : [...current, agentID],
    )
  }

  const updateSelectedProfile = (patch: Partial<AgentProfileDraft>) => {
    if (!selectedAgentID) return
    setProfiles((current) => {
      const currentProfile =
        current[selectedAgentID] ??
        profileDraftFromAgent(
          agents.find((agent) => agent.id === selectedAgentID) ?? {
            id: selectedAgentID,
            name: selectedAgentID,
            allowed: true,
          },
        )
      return {
        ...current,
        [selectedAgentID]: {
          ...currentProfile,
          ...patch,
        },
      }
    })
  }

  const updateSelectedRoleConfig = (
    updater: (current: RoleConfigDraft) => RoleConfigDraft,
  ) => {
    if (!selectedAgentID) return
    const current = parseRoleConfigDraft(selectedRoleConfigDraft) ?? {}
    const next = updater(current)
    setRoleConfigDrafts((drafts) => ({
      ...drafts,
      [selectedAgentID]: JSON.stringify(next, null, 2),
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const parsedRoleConfigs: Record<string, Record<string, unknown>> = {}
      for (const [id, draft] of Object.entries(roleConfigDrafts)) {
        const trimmed = draft.trim()
        if (!trimmed) continue
        const parsed = JSON.parse(trimmed) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            t(
              "pages.orchestration.role_config_invalid",
              "Perfil operacional deve ser um objeto JSON.",
            ),
          )
        }
        parsedRoleConfigs[id] = parsed as Record<string, unknown>
      }
      const next = await updateInternalAgentOrchestration({
        main_agent_id: mainAgentID,
        main_allow_agents: mainAllowAgents,
        assistant_whatsapp_jids: assistantJIDs
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        assistant_whatsapp_chats: assistantChats
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        agent_profiles: Object.fromEntries(
          Object.entries(profiles).map(([id, profile]) => [
            id,
            {
              name: profile.name.trim(),
              avatar: {
                type: profile.imageURL.trim() ? "image" : "preset",
                icon: profile.icon.trim(),
                initials: profile.initials.trim().slice(0, 4).toUpperCase(),
                background: profile.background.trim(),
                foreground: profile.foreground.trim(),
                image_url: profile.imageURL.trim(),
              },
            },
          ]),
        ),
        agent_role_configs: parsedRoleConfigs,
      })
      const nextMainAgentID =
        next.main_agent_id ||
        next.agents.find((agent) => agent.default)?.id ||
        mainAgentID
      setData(next)
      setMainAgentID(nextMainAgentID)
      setMainAllowAgents(
        (next.main_allow_agents || []).filter((id) => id !== nextMainAgentID),
      )
      setAssistantJIDs(
        (next.assistant_whatsapp_jids || next.admin_whatsapp_jids || []).join(
          "\n",
        ),
      )
      setAssistantChats((next.assistant_whatsapp_chats || []).join("\n"))
      setProfiles(
        Object.fromEntries(
          next.agents.map((agent) => [agent.id, profileDraftFromAgent(agent)]),
        ),
      )
      setRoleConfigDrafts(
        Object.fromEntries(
          next.agents.map((agent) => [
            agent.id,
            JSON.stringify(agent.role_config ?? {}, null, 2),
          ]),
        ),
      )
      toast.success(t("pages.orchestration.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    const content = message.trim()
    if (!selectedAgentID || !content) return
    setSending(true)
    setMessages((current) => [...current, { role: "user", content }])
    setMessage("")
    try {
      const response = await sendInternalAgentTurn(
        selectedAgentID,
        content,
        sessionID,
      )
      setSessionID(response.session_id)
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.content },
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-background flex h-full flex-col">
      <PageHeader title={t("navigation.orchestration")} />
      <div className="flex-1 overflow-auto px-6 py-6 pb-20">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconRobot className="size-4" />
                  {t("pages.orchestration.agents")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="text-muted-foreground text-sm">
                    {t("common.loading", "Carregando...")}
                  </div>
                ) : (
                  agents.map((agent) => (
                    <AgentButton
                      key={agent.id}
                      agent={agent}
                      selected={agent.id === selectedAgentID}
                      isMain={agent.id === mainAgentID}
                      onClick={() => {
                        setSelectedAgentID(agent.id)
                        setMessages([])
                        setSessionID(undefined)
                      }}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {selectedAgent && selectedProfile && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AgentAvatar
                      agent={selectedAgent}
                      profile={selectedProfile}
                    />
                    <span>{t("pages.orchestration.profile", "Perfil")}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2">
                    <div className="text-muted-foreground text-xs font-medium">
                      {t("pages.orchestration.agent_name", "Nome")}
                    </div>
                    <Input
                      value={selectedProfile.name}
                      onChange={(event) =>
                        updateSelectedProfile({ name: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground text-xs font-medium">
                        {t("pages.orchestration.avatar_icon", "Icone")}
                      </div>
                      <Input
                        value={selectedProfile.icon}
                        onChange={(event) =>
                          updateSelectedProfile({ icon: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground text-xs font-medium">
                        {t("pages.orchestration.avatar_initials", "Iniciais")}
                      </div>
                      <Input
                        value={selectedProfile.initials}
                        onChange={(event) =>
                          updateSelectedProfile({
                            initials: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground text-xs font-medium">
                        {t("pages.orchestration.avatar_background", "Fundo")}
                      </div>
                      <Input
                        value={selectedProfile.background}
                        onChange={(event) =>
                          updateSelectedProfile({
                            background: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground text-xs font-medium">
                        {t("pages.orchestration.avatar_foreground", "Texto")}
                      </div>
                      <Input
                        value={selectedProfile.foreground}
                        onChange={(event) =>
                          updateSelectedProfile({
                            foreground: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-muted-foreground text-xs font-medium">
                      {t("pages.orchestration.avatar_image", "Imagem URL")}
                    </div>
                    <Input
                      value={selectedProfile.imageURL}
                      onChange={(event) =>
                        updateSelectedProfile({ imageURL: event.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedAgent && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconSparkles className="size-4" />
                    <span>
                      {t(
                        "pages.orchestration.role_config",
                        "Perfil operacional",
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-muted-foreground text-xs">
                    {t(
                      "pages.orchestration.role_config_hint",
                      "Configuração estruturada do papel deste agente. A Clara poderá preencher estes dados no futuro.",
                    )}
                  </div>
                  {selectedRoleConfig && (
                    <RoleSpecificConfigEditor
                      config={selectedRoleConfig}
                      onChange={updateSelectedRoleConfig}
                    />
                  )}
                  <Textarea
                    value={selectedRoleConfigDraft}
                    onChange={(event) =>
                      setRoleConfigDrafts((current) => ({
                        ...current,
                        [selectedAgent.id]: event.target.value,
                      }))
                    }
                    className="min-h-64 font-mono text-xs"
                    spellCheck={false}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconShield className="size-4" />
                  {t("pages.orchestration.main_allowlist")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs font-medium">
                    {t("pages.orchestration.main_agent")}
                  </div>
                  <Select
                    value={mainAgentID}
                    onValueChange={handleMainAgentChange}
                    disabled={loading || agents.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={t(
                          "pages.orchestration.main_agent_placeholder",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name || agent.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mainAgent && (
                    <div className="text-muted-foreground text-xs">
                      {mainAgent.id}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {subagentOptions.map((agent) => (
                    <label
                      key={agent.id}
                      className="border-border/60 flex min-h-10 items-center justify-between rounded-md border px-3 text-sm"
                    >
                      <span className="font-medium">{agent.name}</span>
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={mainAllowAgents.includes(agent.id)}
                        onChange={() => toggleMainAllow(agent.id)}
                      />
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs font-medium">
                    {t(
                      "pages.orchestration.assistant_jids",
                      "Numeros autorizados da Sofia",
                    )}
                  </div>
                  <Textarea
                    value={assistantJIDs}
                    onChange={(event) => setAssistantJIDs(event.target.value)}
                    placeholder={t(
                      "pages.orchestration.admin_jids_placeholder",
                    )}
                    className="min-h-20 resize-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs font-medium">
                    {t(
                      "pages.orchestration.assistant_chats",
                      "Grupos autorizados da Sofia",
                    )}
                  </div>
                  <Textarea
                    value={assistantChats}
                    onChange={(event) => setAssistantChats(event.target.value)}
                    placeholder="group:120363000000000000@g.us"
                    className="min-h-20 resize-none text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving || !mainAgentID}>
                    <IconDeviceFloppy className="size-4" />
                    {t("common.save", "Salvar")}
                  </Button>
                  <Button variant="outline" onClick={load} disabled={loading}>
                    <IconRefresh className="size-4" />
                    {t("common.refresh", "Atualizar")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid min-h-[620px] gap-4 lg:grid-rows-[minmax(0,1fr)_auto]">
            <Card className="min-h-0">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedAgent && (
                      <AgentAvatar
                        agent={selectedAgent}
                        profile={profiles[selectedAgent.id]}
                      />
                    )}
                    <span className="truncate">
                      {profiles[selectedAgentID]?.name ||
                        selectedAgent?.name ||
                        selectedAgentID}
                    </span>
                  </span>
                  {selectedAgent && (
                    <Badge variant="outline">
                      {(selectedAgent.access?.panel_roles?.length ?? 0) > 0
                        ? t("pages.orchestration.internal")
                        : t("pages.orchestration.available")}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex h-full min-h-0 flex-col gap-4">
                {quickPrompts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((item) => {
                      const Icon = item.icon
                      return (
                        <Button
                          key={item.label}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setMessage(item.prompt)}
                        >
                          <Icon className="size-4" />
                          {item.label}
                        </Button>
                      )
                    })}
                  </div>
                )}
                <div className="border-border/60 bg-muted/20 min-h-80 flex-1 overflow-auto rounded-md border p-4">
                  {messages.length === 0 ? (
                    <div className="text-muted-foreground text-sm">
                      {t("pages.orchestration.empty_chat")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((item, index) => (
                        <div
                          key={`${item.role}-${index}`}
                          className={
                            item.role === "user"
                              ? "bg-primary text-primary-foreground ml-auto max-w-[80%] rounded-md px-3 py-2 text-sm"
                              : "bg-background ring-foreground/10 mr-auto max-w-[86%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap shadow-xs ring-1"
                          }
                        >
                          {item.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault()
                        void send()
                      }
                    }}
                    className="min-h-20 resize-none"
                  />
                  <Button
                    className="h-20 w-12 shrink-0"
                    onClick={send}
                    disabled={!message.trim() || !selectedAgentID || sending}
                    aria-label={t("pages.orchestration.send")}
                  >
                    <IconSend className="size-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("pages.orchestration.proposals")}</CardTitle>
              </CardHeader>
              <CardContent>
                {proposals.length === 0 ? (
                  <div className="text-muted-foreground text-sm">
                    {t("pages.orchestration.empty_proposals")}
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {proposals.slice(0, 6).map((proposal, index) => (
                      <ProposalCard
                        key={index}
                        proposal={proposal}
                        onInspect={() =>
                          setMessage(
                            `Revise esta proposta salva e me diga quais arquivos foram gerados, próximos ajustes e pendências:\n\n${JSON.stringify(
                              proposal,
                              null,
                              2,
                            )}`,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentButton({
  agent,
  selected,
  isMain,
  onClick,
}: {
  agent: AgentSummary
  selected: boolean
  isMain: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-border/60 hover:bg-muted/60 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        selected ? "bg-accent text-accent-foreground" : "bg-background"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AgentAvatar agent={agent} />
        <span className="truncate font-medium">{agent.name}</span>
      </span>
      <Badge variant={isMain ? "default" : "outline"}>
        {isMain ? "main" : agent.id}
      </Badge>
    </button>
  )
}

function RoleSpecificConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (current: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  switch (String(config.kind || "")) {
    case "attendant":
      return <AttendantRoleConfigEditor config={config} onChange={onChange} />
    case "sales":
      return <SalesRoleConfigEditor config={config} onChange={onChange} />
    case "marketing":
      return <MarketingRoleConfigEditor config={config} onChange={onChange} />
    case "assistant":
      return <AssistantRoleConfigEditor config={config} onChange={onChange} />
    default:
      return null
  }
}

function AttendantRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (current: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const attendant = (config.attendant || {}) as AttendantRoleConfig
  const updateAttendant = (patch: Partial<AttendantRoleConfig>) => {
    onChange((current) => ({
      ...current,
      attendant: {
        ...((current.attendant || {}) as AttendantRoleConfig),
        ...patch,
      },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 space-y-4 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Ana: atendimento e triagem</div>
          <div className="text-muted-foreground text-xs">
            Setores, dados mínimos e regras de escalonamento da porta pública.
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Agendamento
          <Switch
            checked={attendant.scheduling_enabled ?? false}
            onCheckedChange={(checked) =>
              updateAttendant({ scheduling_enabled: checked })
            }
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Setores"
          value={lines(attendant.departments)}
          placeholder={"vendas\nsuporte\nfinanceiro\nhumano"}
          onChange={(value) =>
            updateAttendant({ departments: splitLines(value) })
          }
        />
        <TextListField
          label="Dados de triagem"
          value={lines(attendant.triage_fields)}
          placeholder={"nome\ncontato\nassunto\nurgencia"}
          onChange={(value) =>
            updateAttendant({ triage_fields: splitLines(value) })
          }
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Regras de escalonamento"
          value={lines(attendant.escalation_rules)}
          placeholder={"reclamacao grave\ndesconto ou excecao\ninformacao nao confirmada"}
          onChange={(value) =>
            updateAttendant({ escalation_rules: splitLines(value) })
          }
        />
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Fonte de FAQ
          </div>
          <Input
            value={attendant.faq_source || ""}
            onChange={(event) =>
              updateAttendant({ faq_source: event.target.value })
            }
            placeholder="company_context"
          />
        </div>
      </div>
    </div>
  )
}

function SalesRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (current: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const sales = (config.sales || {}) as SalesRoleConfig
  const updateSales = (patch: Partial<SalesRoleConfig>) => {
    onChange((current) => ({
      ...current,
      sales: {
        ...((current.sales || {}) as SalesRoleConfig),
        ...patch,
      },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 space-y-4 rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">Leo: vendas e follow-up</div>
        <div className="text-muted-foreground text-xs">
          Funil, qualificação, CRM futuro e regras de handoff comercial.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Etapas do funil"
          value={lines(sales.funnel_stages)}
          placeholder={"novo\nqualificacao\nproposta\nfollow_up\nganho\nperdido"}
          onChange={(value) =>
            updateSales({ funnel_stages: splitLines(value) })
          }
        />
        <TextListField
          label="Campos de qualificação"
          value={lines(sales.qualification_fields)}
          placeholder={"problema\nfit\nautoridade\nprazo\norcamento\nproximo_passo"}
          onChange={(value) =>
            updateSales({ qualification_fields: splitLines(value) })
          }
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Cadência de follow-up"
          value={lines(sales.followup_cadence)}
          placeholder={"D+1\nD+3\nD+7"}
          onChange={(value) =>
            updateSales({ followup_cadence: splitLines(value) })
          }
        />
        <TextListField
          label="Regras de handoff"
          value={lines(sales.handoff_rules)}
          placeholder={"lead qualificado com prazo\npedido de contrato\nexcecao comercial"}
          onChange={(value) =>
            updateSales({ handoff_rules: splitLines(value) })
          }
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            CRM / sistema
          </div>
          <Input
            value={sales.crm_integration || ""}
            onChange={(event) =>
              updateSales({ crm_integration: event.target.value })
            }
            placeholder="future, planilha, CRM..."
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Fonte de preços
          </div>
          <Input
            value={sales.price_policy_source || ""}
            onChange={(event) =>
              updateSales({ price_policy_source: event.target.value })
            }
            placeholder="memory/pricing.md"
          />
        </div>
      </div>
    </div>
  )
}

function MarketingRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (current: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const marketing = (config.marketing || {}) as MarketingRoleConfig
  const cadence = marketing.cadence || {}
  const brandKit = marketing.brand_kit || {}

  const updateMarketing = (patch: Partial<MarketingRoleConfig>) => {
    onChange((current) => ({
      ...current,
      marketing: {
        ...((current.marketing || {}) as MarketingRoleConfig),
        ...patch,
      },
    }))
  }

  const updateBrandKit = (
    patch: NonNullable<MarketingRoleConfig["brand_kit"]>,
  ) => {
    updateMarketing({
      brand_kit: {
        ...brandKit,
        ...patch,
      },
    })
  }

  const updateCadence = (
    patch: NonNullable<MarketingRoleConfig["cadence"]>,
  ) => {
    updateMarketing({
      cadence: {
        ...cadence,
        ...patch,
      },
    })
  }

  return (
    <div className="border-border/60 bg-muted/20 space-y-4 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Maya: sites e catálogos</div>
          <div className="text-muted-foreground text-xs">
            Campos usados para orientar criação de campanhas, páginas simples e
            catálogos HTML.
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Revisão humana
          <Switch
            checked={marketing.requires_human_review ?? true}
            onCheckedChange={(checked) =>
              updateMarketing({ requires_human_review: checked })
            }
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Pasta pública
          </div>
          <Input
            value={marketing.public_publish_dir || ""}
            onChange={(event) =>
              updateMarketing({ public_publish_dir: event.target.value })
            }
            placeholder="public/marketing"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Aprovação
          </div>
          <Select
            value={marketing.approval_mode || "owner_required"}
            onValueChange={(value) => updateMarketing({ approval_mode: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner_required">Dono aprova</SelectItem>
              <SelectItem value="admin_required">Admin aprova</SelectItem>
              <SelectItem value="draft_only">Apenas rascunho</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Plataformas"
          value={lines(marketing.platforms)}
          placeholder={"instagram\nsite\ncatalog_html"}
          onChange={(value) =>
            updateMarketing({ platforms: splitLines(value) })
          }
        />
        <TextListField
          label="Entregáveis"
          value={lines(marketing.deliverables)}
          placeholder={"post\ncampaign\ncatalog_html\nsimple_site"}
          onChange={(value) =>
            updateMarketing({ deliverables: splitLines(value) })
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Pilares de conteúdo"
          value={lines(marketing.content_pillars)}
          placeholder={"educação\nprova social\npromoções"}
          onChange={(value) =>
            updateMarketing({ content_pillars: splitLines(value) })
          }
        />
        <TextListField
          label="Fontes de tendência"
          value={lines(marketing.trend_sources)}
          placeholder={"instagram\ngoogle_trends\nconcorrentes"}
          onChange={(value) =>
            updateMarketing({ trend_sources: splitLines(value) })
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Cores da marca"
          value={lines(brandKit.colors)}
          placeholder={"#111827\n#f97316"}
          onChange={(value) => updateBrandKit({ colors: splitLines(value) })}
        />
        <TextListField
          label="Fontes da marca"
          value={lines(brandKit.fonts)}
          placeholder={"Inter\nMontserrat"}
          onChange={(value) => updateBrandKit({ fonts: splitLines(value) })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">Tom</div>
          <Input
            value={brandKit.tone || ""}
            onChange={(event) => updateBrandKit({ tone: event.target.value })}
            placeholder="claro, próximo e profissional"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Estilo visual
          </div>
          <Input
            value={brandKit.visual_style || ""}
            onChange={(event) =>
              updateBrandKit({ visual_style: event.target.value })
            }
            placeholder="limpo, moderno, com fotos reais"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Posts/semana
          </div>
          <Input
            type="number"
            min={0}
            value={cadence.posts_per_week ?? ""}
            onChange={(event) =>
              updateCadence({
                posts_per_week: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Campanhas/mês
          </div>
          <Input
            type="number"
            min={0}
            value={cadence.campaigns_per_month ?? ""}
            onChange={(event) =>
              updateCadence({
                campaigns_per_month: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            Horizonte
          </div>
          <Input
            value={cadence.planning_horizon || ""}
            onChange={(event) =>
              updateCadence({ planning_horizon: event.target.value })
            }
            placeholder="1-4 semanas"
          />
        </div>
      </div>
    </div>
  )
}

function AssistantRoleConfigEditor({
  config,
  onChange,
}: {
  config: RoleConfigDraft
  onChange: (updater: (current: RoleConfigDraft) => RoleConfigDraft) => void
}) {
  const assistant = (config.assistant || {}) as AssistantRoleConfig
  const updateAssistant = (patch: Partial<AssistantRoleConfig>) => {
    onChange((current) => ({
      ...current,
      assistant: {
        ...((current.assistant || {}) as AssistantRoleConfig),
        ...patch,
      },
    }))
  }

  return (
    <div className="border-border/60 bg-muted/20 space-y-4 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Sofia: assistente do dono</div>
          <div className="text-muted-foreground text-xs">
            Escopos privados, relatórios, agentes chamados e confirmações.
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Edita agentes
          <Switch
            checked={assistant.can_edit_agents ?? true}
            onCheckedChange={(checked) =>
              updateAssistant({ can_edit_agents: checked })
            }
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Escopos autorizados"
          value={lines(assistant.authorized_scopes)}
          placeholder={"workspace\nagents\nreports\ndocuments\nagenda\norchestration"}
          onChange={(value) =>
            updateAssistant({ authorized_scopes: splitLines(value) })
          }
        />
        <TextListField
          label="Relatórios"
          value={lines(assistant.report_cadence)}
          placeholder={"daily\nweekly\nmonthly"}
          onChange={(value) =>
            updateAssistant({ report_cadence: splitLines(value) })
          }
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextListField
          label="Pode chamar agentes"
          value={lines(assistant.can_call_agents)}
          placeholder={"main\nvendas\nmarketing"}
          onChange={(value) =>
            updateAssistant({ can_call_agents: splitLines(value) })
          }
        />
        <TextListField
          label="Exige confirmação"
          value={lines(assistant.requires_confirmation)}
          placeholder={"editar agentes\nalterar permissoes\npublicar materiais\napagar arquivos"}
          onChange={(value) =>
            updateAssistant({ requires_confirmation: splitLines(value) })
          }
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-muted-foreground text-xs font-medium">
          Auditoria
        </div>
        <Select
          value={assistant.audit_level || "high"}
          onValueChange={(value) => updateAssistant({ audit_level: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function TextListField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-20 resize-none text-sm"
      />
    </div>
  )
}

function ProposalCard({
  proposal,
  onInspect,
}: {
  proposal: unknown
  onInspect: () => void
}) {
  const kind = proposalKind(proposal)
  const assets = proposalAssets(proposal)
  const publicURLs = proposalPublicURLs(proposal)
  const isSite = kind === "site"
  const isCatalog = kind === "catalog"
  const Icon = isSite
    ? IconWorldWww
    : isCatalog
      ? IconFileDescription
      : IconSparkles

  return (
    <div className="bg-muted/30 ring-border/60 rounded-md p-3 text-sm ring-1">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {proposalTitle(proposal)}
            </div>
            <div className="text-muted-foreground text-xs">
              {kind || "marketing"}
            </div>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onInspect}>
          Revisar
        </Button>
      </div>
      {assets.length > 0 ? (
        <div className="space-y-1">
          {assets.slice(0, 3).map((asset) => (
            <div
              key={asset}
              className="text-muted-foreground truncate font-mono text-xs"
              title={asset}
            >
              {asset}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          Sem arquivo vinculado.
        </div>
      )}
      {publicURLs.length > 0 && (
        <div className="border-border/60 mt-3 space-y-1 border-t pt-2">
          {publicURLs.slice(0, 3).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary block truncate text-xs hover:underline"
              title={url}
            >
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentAvatar({
  agent,
  profile,
}: {
  agent: AgentSummary
  profile?: AgentProfileDraft
}) {
  const avatar = profile
    ? {
        icon: profile.icon,
        initials: profile.initials,
        background: profile.background,
        foreground: profile.foreground,
        image_url: profile.imageURL,
      }
    : agent.avatar
  const Icon = iconForAgentAvatar(avatar?.icon)
  const imageURL = avatar?.image_url?.trim()
  const initials =
    avatar?.initials?.trim() ||
    (agent.name || agent.id).slice(0, 2).toUpperCase()

  return (
    <span
      className="ring-border/50 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold ring-1"
      style={{
        backgroundColor: avatar?.background || "#475569",
        color: avatar?.foreground || "#ffffff",
      }}
    >
      {imageURL ? (
        <img src={imageURL} alt="" className="size-full object-cover" />
      ) : Icon ? (
        <Icon className="size-4" />
      ) : (
        initials
      )}
    </span>
  )
}

function iconForAgentAvatar(icon?: string) {
  switch ((icon || "").trim().toLowerCase()) {
    case "headset":
      return IconHeadset
    case "target":
    case "sales":
      return IconTargetArrow
    case "sparkles":
    case "marketing":
      return IconSparkles
    case "assistant":
    case "shield":
      return IconUserShield
    case "robot":
      return IconRobot
    default:
      return null
  }
}
