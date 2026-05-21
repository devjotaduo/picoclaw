import {
  IconAlertTriangle,
  IconAtom,
  IconBook,
  IconBrandWhatsapp,
  IconChartBar,
  IconClockHour4,
  IconCopy,
  IconKey,
  IconLayoutDashboard,
  IconListDetails,
  IconMessageCircle,
  IconPlus,
  IconRobot,
  IconSearch,
  IconServer,
  IconSettings,
  IconSparkles,
  IconTools,
  IconUserCheck,
} from "@tabler/icons-react"
import { Link, useRouterState } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  type AgentDashboardItem,
  getAgentDashboard,
} from "@/api/agent-dashboard"
import {
  type LauncherFeatureAccess,
  getLauncherPolicy,
} from "@/api/launcher-policy"
import { type WorkspaceAgent, getWorkspaceAgents } from "@/api/workspace-agents"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  actionableDashboardItems,
  dashboardItemStamp,
  formatDashboardDate,
  friendlyAgentName,
  friendlyDashboardText,
} from "@/lib/agent-dashboard"

const SIDEBAR_PENDING_HEARTBEAT_MS = 30_000
const SIDEBAR_PENDING_LIMIT = 3

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  feature: string
  translateTitle?: boolean
  external?: boolean
  adminOnly?: boolean
}

interface NavGroup {
  label: string
  defaultOpen: boolean
  items: NavItem[]
  isChannelsGroup?: boolean
}

const baseNavGroups: Omit<NavGroup, "items">[] = [
  {
    label: "navigation.chat",
    defaultOpen: true,
  },
  {
    label: "navigation.model_group",
    defaultOpen: true,
  },
  {
    label: "navigation.agent_group",
    defaultOpen: true,
  },
  {
    label: "navigation.config",
    defaultOpen: true,
  },
]

const featureFallbacks: Record<string, string> = {
  agent_hub: "tools",
  template_editor: "agent_templates",
  skill_editor: "skills",
  whatsapp_reports: "whatsapp_inbox",
  operacao_memory: "config",
  operacao_pendencias: "config",
  operacao_cron: "config",
}

// Features hidden from the sidebar across the board (still reachable via
// direct URLs / commands if the user knows where to find them).
const hiddenSidebarFeatures = new Set([
  "models",
  "credentials",
  "agent_hub",
  "agent_templates",
  "template_editor",
  "skill_editor",
  "tools",
  "logs",
])

function fallbackFeature(feature: string): string | undefined {
  if (feature.startsWith("channel:")) {
    return "channels"
  }
  return featureFallbacks[feature]
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const routerState = useRouterState()
  const { t } = useTranslation()
  const { isMobile, setOpenMobile } = useSidebar()
  const currentPath = routerState.location.pathname
  const [features, setFeatures] = React.useState<Record<
    string,
    LauncherFeatureAccess
  > | null>(null)
  const [isSaasAdmin, setIsSaasAdmin] = React.useState(false)
  const [workspaceAgents, setWorkspaceAgents] = React.useState<
    WorkspaceAgent[]
  >([])
  const [sidebarDashboardItems, setSidebarDashboardItems] = React.useState<
    AgentDashboardItem[]
  >([])

  React.useEffect(() => {
    let active = true
    getLauncherPolicy()
      .then((policy) => {
        if (active) {
          setFeatures(policy.features)
          setIsSaasAdmin(Boolean(policy.is_saas_admin))
        }
      })
      .catch(() => {
        if (active) {
          setFeatures(null)
          setIsSaasAdmin(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    let active = true
    getWorkspaceAgents()
      .then((response) => {
        if (active) {
          setWorkspaceAgents(response.agents)
        }
      })
      .catch(() => {
        if (active) {
          setWorkspaceAgents([])
        }
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    let active = true

    const loadDashboardItems = () => {
      getAgentDashboard()
        .then((response) => {
          if (active) {
            setSidebarDashboardItems(response.items)
          }
        })
        .catch(() => {
          if (active) {
            setSidebarDashboardItems([])
          }
        })
    }

    loadDashboardItems()
    const heartbeat = window.setInterval(
      loadDashboardItems,
      SIDEBAR_PENDING_HEARTBEAT_MS,
    )

    return () => {
      active = false
      window.clearInterval(heartbeat)
    }
  }, [])

  const sidebarPendingItems = React.useMemo(() => {
    return actionableDashboardItems(sidebarDashboardItems)
  }, [sidebarDashboardItems])

  const canRead = React.useCallback(
    (feature: string) => {
      if (!features) {
        return true
      }
      const access =
        features[feature] ?? features[fallbackFeature(feature) ?? ""]
      return access === "read" || access === "write"
    },
    [features],
  )

  const handleNavItemClick = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, setOpenMobile])

  const navGroups: NavGroup[] = React.useMemo(() => {
    return [
      {
        ...baseNavGroups[0],
        items: [
          {
            title: "navigation.chat",
            url: "/",
            icon: IconMessageCircle,
            feature: "chat",
            translateTitle: true,
          },
        ],
      },
      {
        ...baseNavGroups[1],
        items: [
          {
            title: "navigation.models",
            url: "/models",
            icon: IconAtom,
            feature: "models",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.credentials",
            url: "/credentials",
            icon: IconKey,
            feature: "credentials",
            translateTitle: true,
            adminOnly: true,
          },
        ],
      },
      {
        ...baseNavGroups[2],
        items: [
          {
            title: "navigation.agent_dashboard",
            url: "/agent/dashboard",
            icon: IconLayoutDashboard,
            feature: "agent_editor",
            translateTitle: true,
          },
          {
            title: "navigation.agent_editor",
            url: "/agent/agents",
            icon: IconRobot,
            feature: "agent_editor",
            translateTitle: true,
          },
          {
            title: "navigation.whatsapp_inbox",
            url: "/agent/whatsapp",
            icon: IconBrandWhatsapp,
            feature: "whatsapp_inbox",
            translateTitle: true,
          },
          {
            title: "navigation.whatsapp_reports",
            url: "/agent/whatsapp-reports",
            icon: IconChartBar,
            feature: "whatsapp_reports",
            translateTitle: true,
          },
          {
            title: "navigation.hub",
            url: "/agent/hub",
            icon: IconSearch,
            feature: "agent_hub",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.templates",
            url: "/agent/templates",
            icon: IconUserCheck,
            feature: "agent_templates",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.template_editor",
            url: "/agent/template-editor",
            icon: IconListDetails,
            feature: "template_editor",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.skills",
            url: "/agent/skills",
            icon: IconSparkles,
            feature: "skills",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.skill_editor",
            url: "/agent/skill-editor",
            icon: IconListDetails,
            feature: "skill_editor",
            translateTitle: true,
            adminOnly: true,
          },
        ],
      },
      {
        label: "navigation.operation_group",
        defaultOpen: true,
        items: [
          {
            title: "navigation.memory",
            url: "/memory",
            icon: IconBook,
            feature: "operacao_memory",
            translateTitle: true,
          },
          {
            title: "navigation.pendencias",
            url: "/pendencias",
            icon: IconAlertTriangle,
            feature: "operacao_pendencias",
            translateTitle: true,
          },
          {
            title: "navigation.cron",
            url: "/cron",
            icon: IconClockHour4,
            feature: "operacao_cron",
            translateTitle: true,
          },
        ],
      },
      {
        ...baseNavGroups[3],
        items: [
          {
            title: "navigation.tools",
            url: "/agent/tools",
            icon: IconTools,
            feature: "tools",
            translateTitle: true,
            adminOnly: true,
          },
          {
            title: "navigation.config",
            url: "/config",
            icon: IconSettings,
            feature: "config",
            translateTitle: true,
          },
          {
            title: "navigation.logs",
            url: "/logs",
            icon: IconListDetails,
            feature: "logs",
            translateTitle: true,
            adminOnly: true,
          },
        ],
      },
      // Administração — só aparece quando o launcher está em modo SaaS
      // admin (PICOCLAW_SAAS_ADMIN_MODE=true + creds do controlplane). A
      // checagem real fica no backend; aqui apenas escondemos o grupo para
      // não confundir o usuário comum do launcher.
      ...(isSaasAdmin
        ? [
            {
              label: "navigation.admin_group",
              defaultOpen: false,
              items: [
                {
                  title: "navigation.admin_tenants",
                  url: "/admin/tenants",
                  icon: IconServer,
                  feature: "admin_panel",
                  translateTitle: true,
                },
                {
                  title: "navigation.admin_new_tenant",
                  url: "/admin/tenants/new",
                  icon: IconPlus,
                  feature: "admin_panel",
                  translateTitle: true,
                },
                {
                  title: "navigation.admin_clone",
                  url: "/admin/clone",
                  icon: IconCopy,
                  feature: "admin_panel",
                  translateTitle: true,
                },
              ],
            },
          ]
        : []),
    ]
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (!item.adminOnly || isSaasAdmin) &&
            !hiddenSidebarFeatures.has(item.feature) &&
            canRead(item.feature),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [canRead, isSaasAdmin])

  return (
    <Sidebar
      {...props}
      collapsible="icon"
      className="bg-background border-r-border/20 border-r pt-3"
    >
      <SidebarContent className="bg-background gap-1 px-2 pt-3 pb-2">
        {navGroups.map((group) => {
          const isFlatGroup =
            group.label === "navigation.agent_group" ||
            group.label === "navigation.chat" ||
            group.label === "navigation.channels_group" ||
            group.label === "navigation.config"
          const menuContent = (
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  currentPath === item.url ||
                  (item.url !== "/" && currentPath.startsWith(`${item.url}/`))
                const title =
                  item.translateTitle === false ? item.title : t(item.title)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      onClick={handleNavItemClick}
                      tooltip={title}
                      data-tour={
                        item.url === "/models" ? "models-nav" : undefined
                      }
                      className={`h-9 px-3 ${isActive ? "bg-accent/80 text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
                    >
                      {item.external ? (
                        <a href={item.url}>
                          <item.icon className="size-4 opacity-60" />
                          <span className="opacity-80">{title}</span>
                        </a>
                      ) : (
                        <Link to={item.url}>
                          <item.icon
                            className={`size-4 ${isActive ? "opacity-100" : "opacity-60"}`}
                          />
                          <span
                            className={isActive ? "opacity-100" : "opacity-80"}
                          >
                            {title}
                          </span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          )

          if (isFlatGroup) {
            return (
              <SidebarGroup key={group.label} className="mb-0 px-0 py-0">
                <SidebarGroupContent className="pt-0">
                  {menuContent}
                </SidebarGroupContent>
              </SidebarGroup>
            )
          }

          return (
            <SidebarGroup key={group.label} className="mb-0.5 px-0 py-0">
              <SidebarGroupLabel className="px-2 py-1.5">
                <span>{t(group.label)}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent className="pt-0">
                {menuContent}
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarFooter className="bg-background px-2 pt-2 pb-3 group-data-[collapsible=icon]:hidden">
        <SidebarAgentPendingList
          agents={workspaceAgents}
          items={sidebarPendingItems}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SidebarAgentPendingList({
  agents,
  items,
}: {
  agents: WorkspaceAgent[]
  items: AgentDashboardItem[]
}) {
  const visibleItems = items.slice(0, SIDEBAR_PENDING_LIMIT)

  return (
    <aside className="border-border/70 bg-card text-card-foreground flex min-h-[190px] flex-col overflow-hidden rounded-xl border p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
            Pendências
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <p className="text-foreground text-lg leading-none font-semibold">
              Top {SIDEBAR_PENDING_LIMIT}
            </p>
            <span className="text-muted-foreground text-[11px]">
              {items.length} {items.length === 1 ? "aberta" : "abertas"}
            </span>
          </div>
        </div>
        <Link
          to="/agent/dashboard"
          className="text-muted-foreground hover:text-foreground mt-1 shrink-0 text-[11px] font-medium underline-offset-4 hover:underline"
        >
          Ver painel
        </Link>
      </div>

      {visibleItems.length > 0 ? (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <SidebarAgentPendingItem
              key={`${item.source}:${item.id}`}
              agents={agents}
              item={item}
            />
          ))}
        </div>
      ) : (
        <div className="border-border/60 bg-muted/20 flex min-h-20 items-center justify-center rounded-lg border border-dashed px-3 text-center">
          <p className="text-muted-foreground text-xs leading-5">
            Nenhuma solicitação pendente agora.
          </p>
        </div>
      )}
    </aside>
  )
}

function SidebarAgentPendingItem({
  agents,
  item,
}: {
  agents: WorkspaceAgent[]
  item: AgentDashboardItem
}) {
  const itemAgentName = cleanSidebarAgentName(friendlyAgentName(item))
  const agent =
    agents.find((entry) => itemAgentName && entry.name === itemAgentName) ??
    agents.find(
      (entry) =>
        item.agent_id && entry.id.toLowerCase() === item.agent_id.toLowerCase(),
    )
  const name = cleanSidebarAgentName(itemAgentName || agent?.name || "Agente")
  const initials = getSidebarAgentInitials(name)
  const stamp = formatDashboardDate(dashboardItemStamp(item))

  return (
    <Link
      to="/agent/dashboard"
      className="hover:bg-muted/35 focus-visible:ring-ring flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition outline-none focus-visible:ring-2"
    >
      <span className="bg-primary/10 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-xs font-medium">
          {name}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-[11px] leading-4">
          {sidebarQuestionText(item)}
        </span>
      </span>
      {stamp ? (
        <span className="text-muted-foreground/80 shrink-0 text-[10px]">
          {stamp}
        </span>
      ) : null}
    </Link>
  )
}

function cleanSidebarAgentName(value: string): string {
  const text = value
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(está|esta)\s+ativo.*$/i, "")
    .split(/[,/]/)[0]
    .trim()

  return text || "Agente"
}

function sidebarQuestionText(item: AgentDashboardItem): string {
  const raw = friendlyDashboardText(item.summary || item.title)
    .replace(/\s+/g, " ")
    .trim()
  const lower = raw.toLowerCase()

  if (lower.includes("formas de pagamento") || lower.includes("pagamento")) {
    return "Confirmar formas de pagamento?"
  }
  if (lower.includes("dados da empresa")) {
    return "Completar dados da empresa?"
  }
  if (lower.includes("canais autorizados")) {
    return "Confirmar canais autorizados?"
  }
  if (lower.includes("cadastro principal")) {
    return "Revisar cadastro principal?"
  }

  const compact = raw
    .replace(/^campo\s+/i, "")
    .replace(/\s+aparece\s+.*$/i, "")
    .replace(/\s+ainda não foram preenchidos.*$/i, "")
    .trim()

  if (!compact) {
    return "Precisa de confirmação?"
  }

  if (compact.endsWith("?")) {
    return compact.length > 82 ? `${compact.slice(0, 79).trim()}...` : compact
  }

  return `${compact.slice(0, 70).trim()}?`
}

function getSidebarAgentInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return "AG"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
