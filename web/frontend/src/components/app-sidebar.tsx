import {
  IconArrowUp,
  IconAtom,
  IconBrandWhatsapp,
  IconChartBar,
  IconCopy,
  IconKey,
  IconListDetails,
  IconMessageCircle,
  IconPaperclip,
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
  type LauncherFeatureAccess,
  getLauncherPolicy,
} from "@/api/launcher-policy"
import {
  getWorkspaceAgents,
  type WorkspaceAgent,
} from "@/api/workspace-agents"
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
import { useSidebarChannels } from "@/hooks/use-sidebar-channels"

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
}

// SaaS tenants only see the whatsapp_native channel in the sidebar; other
// channel-prefixed feature flags exist in the policy but are hidden from
// the default sidebar to reduce clutter.
const visibleSidebarChannelKeys = new Set(["whatsapp_native"])
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
  const { i18n, t } = useTranslation()
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
  const [sidebarPrompt, setSidebarPrompt] = React.useState("")
  const [sidebarLastPrompt, setSidebarLastPrompt] = React.useState("")
  const { channelItems } = useSidebarChannels({
    language: (i18n.resolvedLanguage ?? i18n.language ?? "").toLowerCase(),
    t,
    isSaasAdmin,
  })

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

  const handleSidebarPromptSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = sidebarPrompt.trim()
      if (!trimmed) {
        return
      }
      setSidebarLastPrompt(trimmed)
      setSidebarPrompt("")
    },
    [sidebarPrompt],
  )

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
        label: "navigation.channels_group",
        defaultOpen: true,
        items: channelItems
          .filter((item) => visibleSidebarChannelKeys.has(item.key))
          .map<NavItem>((item) => ({
            title: item.title,
            url: item.url,
            icon: item.icon,
            feature: `channel:${item.key}`,
            translateTitle: false,
          }))
          .filter((item) => canRead(item.feature)),
        isChannelsGroup: true,
      },
      {
        ...baseNavGroups[2],
        items: [
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
  }, [canRead, channelItems, isSaasAdmin])

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
        <SidebarAgentMiniChat
          agents={workspaceAgents}
          prompt={sidebarPrompt}
          lastPrompt={sidebarLastPrompt}
          onPromptChange={setSidebarPrompt}
          onSubmit={handleSidebarPromptSubmit}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SidebarAgentMiniChat({
  agents,
  prompt,
  lastPrompt,
  onPromptChange,
  onSubmit,
}: {
  agents: WorkspaceAgent[]
  prompt: string
  lastPrompt: string
  onPromptChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const agent =
    agents.find((item) => item.name.toLowerCase() === "rafael") ??
    agents.find((item) => item.visibility === "interno") ??
    agents[0]
  const name = agent?.name ?? "Rafael"
  const initials = getSidebarAgentInitials(name)
  const message = lastPrompt
    ? "Recebido. Vou acompanhar e sinalizar se precisar."
    : "Preciso de uma confirmação rápida."

  return (
    <aside className="border-border/70 bg-card text-card-foreground flex min-h-[244px] flex-col overflow-hidden rounded-xl border p-3 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="bg-primary/10 text-primary ring-primary/25 mb-2 flex size-11 items-center justify-center rounded-full text-xs font-semibold ring-1">
          {initials}
        </div>
        <p className="text-foreground text-sm font-medium leading-5">
          {name} está ativo
        </p>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
          {message}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {["Revisar", "Resumo"].map((label) => (
          <button
            key={label}
            type="button"
            className="border-border/70 bg-muted/35 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg border px-2 py-2 text-left text-xs transition"
            onClick={() => onPromptChange(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="border-border/70 bg-muted/20 focus-within:border-primary/35 mt-auto flex items-center gap-1.5 rounded-full border px-2 py-1.5"
        onSubmit={onSubmit}
      >
        <IconPaperclip className="text-muted-foreground size-3.5 shrink-0" />
        <input
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Responder..."
          aria-label="Responder ao mini chat dos agentes"
          className="text-foreground placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          aria-label="Enviar resposta"
          className="bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground flex size-6 items-center justify-center rounded-full transition"
        >
          <IconArrowUp className="size-3.5" />
        </button>
      </form>
    </aside>
  )
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
