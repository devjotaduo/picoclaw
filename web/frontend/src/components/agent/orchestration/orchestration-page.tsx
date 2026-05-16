import {
  IconDeviceFloppy,
  IconRefresh,
  IconRobot,
  IconSend,
  IconShield,
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
import { Textarea } from "@/components/ui/textarea"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

const sensitiveAgents = new Set(["marketing", "gerente"])

export function OrchestrationPage() {
  const { t } = useTranslation()
  const [data, setData] = React.useState<InternalAgentsResponse | null>(null)
  const [selectedAgentID, setSelectedAgentID] = React.useState("gerente")
  const [mainAllowAgents, setMainAllowAgents] = React.useState<string[]>([])
  const [adminJIDs, setAdminJIDs] = React.useState("")
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
      setData(next)
      setMainAllowAgents(next.main_allow_agents || [])
      setAdminJIDs((next.admin_whatsapp_jids || []).join("\n"))
      if (!next.agents.some((agent) => agent.id === selectedAgentID)) {
        setSelectedAgentID(next.agents[0]?.id || "")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedAgentID])

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
  const subagentOptions = agents.filter((agent) => agent.id !== "main")

  const toggleMainAllow = (agentID: string) => {
    setMainAllowAgents((current) =>
      current.includes(agentID)
        ? current.filter((id) => id !== agentID)
        : [...current, agentID],
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = await updateInternalAgentOrchestration({
        main_allow_agents: mainAllowAgents,
        admin_whatsapp_jids: adminJIDs
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
      })
      setData(next)
      setMainAllowAgents(next.main_allow_agents || [])
      setAdminJIDs((next.admin_whatsapp_jids || []).join("\n"))
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconShield className="size-4" />
                  {t("pages.orchestration.main_allowlist")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                <Textarea
                  value={adminJIDs}
                  onChange={(event) => setAdminJIDs(event.target.value)}
                  placeholder={t("pages.orchestration.admin_jids_placeholder")}
                  className="min-h-24 resize-none text-sm"
                />
                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving}>
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
                  <span>{selectedAgent?.name || selectedAgentID}</span>
                  {selectedAgent && (
                    <Badge variant="outline">
                      {sensitiveAgents.has(selectedAgent.id)
                        ? t("pages.orchestration.internal")
                        : t("pages.orchestration.available")}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex h-full min-h-0 flex-col gap-4">
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
                      <pre
                        key={index}
                        className="bg-muted/40 max-h-44 overflow-auto rounded-md p-3 text-xs"
                      >
                        {JSON.stringify(proposal, null, 2)}
                      </pre>
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
  onClick,
}: {
  agent: AgentSummary
  selected: boolean
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
      <span className="font-medium">{agent.name}</span>
      <Badge variant={agent.id === "main" ? "default" : "outline"}>
        {agent.id}
      </Badge>
    </button>
  )
}
