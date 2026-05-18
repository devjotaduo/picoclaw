import {
  IconAtom,
  IconBrandWhatsapp,
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconKey,
  IconListDetails,
  IconMessageCircle,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTools,
  IconUserCheck,
} from "@tabler/icons-react"
import { Link, useRouterState } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { type AgentSummary, getInternalAgents } from "@/api/internal-agents"
import {
  type LauncherFeatureAccess,
  getLauncherPolicy,
} from "@/api/launcher-policy"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
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
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  feature: string
  translateTitle?: boolean
  external?: boolean
}

interface NavGroup {
  label: string
  defaultOpen: boolean
  items: NavItem[]
  isChannelsGroup?: boolean
}

interface SidebarAgentOption {
  id: string
  label: string
  shortLabel: string
  initials: string
  imageURL: string
  background: string
  foreground: string
  accentClassName: string
}

const selectedAgentStorageKey = "picoclaw.sidebar.selectedAgent"

const AGENT_ACCENT_CLASSES = [
  "bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-300",
  "bg-rose-500/15 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 ring-violet-500/25 dark:text-violet-300",
]

function getAgentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "??"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function getAgentAccentClass(index: number): string {
  return AGENT_ACCENT_CLASSES[index % AGENT_ACCENT_CLASSES.length]
}

function agentToSidebarOption(
  agent: AgentSummary,
  index: number,
): SidebarAgentOption {
  const initials = agent.avatar?.initials || getAgentInitials(agent.name)
  const words = agent.name.trim().split(/\s+/).filter(Boolean)
  const shortLabel = words[0] ?? agent.id
  return {
    id: agent.id,
    label: agent.name,
    shortLabel,
    initials,
    imageURL: agent.avatar?.image_url ?? "",
    background: agent.avatar?.background ?? "",
    foreground: agent.avatar?.foreground ?? "",
    accentClassName: getAgentAccentClass(index),
  }
}

function getStoredSidebarAgentID(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(selectedAgentStorageKey) ?? ""
  } catch {
    return ""
  }
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
  const [agentOptions, setAgentOptions] = React.useState<SidebarAgentOption[]>(
    [],
  )
  const [selectedAgentID, setSelectedAgentID] = React.useState(
    getStoredSidebarAgentID,
  )
  const [features, setFeatures] = React.useState<Record<
    string,
    LauncherFeatureAccess
  > | null>(null)
  const {
    channelItems,
    hasMoreChannels,
    showAllChannels,
    toggleShowAllChannels,
  } = useSidebarChannels({
    language: (i18n.resolvedLanguage ?? i18n.language ?? "").toLowerCase(),
    t,
  })

  React.useEffect(() => {
    let active = true
    getLauncherPolicy()
      .then((policy) => {
        if (active) {
          setFeatures(policy.features)
        }
      })
      .catch(() => {
        if (active) {
          setFeatures(null)
        }
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    let active = true
    getInternalAgents()
      .then((data) => {
        if (!active) return
        const options = data.agents.map(agentToSidebarOption)
        setAgentOptions(options)
        setSelectedAgentID((current) => {
          const stored = current || getStoredSidebarAgentID()
          if (stored && options.some((a) => a.id === stored)) return stored
          return options[0]?.id ?? ""
        })
      })
      .catch(() => {})
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

  const selectedAgent = React.useMemo(
    () =>
      agentOptions.find((agent) => agent.id === selectedAgentID) ??
      agentOptions[0] ??
      null,
    [agentOptions, selectedAgentID],
  )

  const handleAgentChange = React.useCallback((agentID: string) => {
    setSelectedAgentID(agentID)
    try {
      window.localStorage.setItem(selectedAgentStorageKey, agentID)
    } catch {
      // Selection still updates for this session if storage is unavailable.
    }
  }, [])

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
          },
          {
            title: "navigation.credentials",
            url: "/credentials",
            icon: IconKey,
            feature: "credentials",
            translateTitle: true,
          },
        ],
      },
      {
        label: "navigation.channels_group",
        defaultOpen: true,
        items: channelItems
          .map((item) => ({
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
            url: "/agent/editor",
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
          },
          {
            title: "navigation.templates",
            url: "/agent/templates",
            icon: IconUserCheck,
            feature: "agent_templates",
            translateTitle: true,
          },
          {
            title: "navigation.template_editor",
            url: "/agent/template-editor",
            icon: IconListDetails,
            feature: "template_editor",
            translateTitle: true,
          },
          {
            title: "navigation.skills",
            url: "/agent/skills",
            icon: IconSparkles,
            feature: "skills",
            translateTitle: true,
          },
          {
            title: "navigation.skill_editor",
            url: "/agent/skill-editor",
            icon: IconListDetails,
            feature: "skill_editor",
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
          },
        ],
      },
    ]
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canRead(item.feature)),
      }))
      .filter((group) => group.items.length > 0)
  }, [canRead, channelItems])

  return (
    <Sidebar
      {...props}
      className="bg-background border-r-border/20 border-r pt-3"
    >
      <SidebarContent className="bg-background">
        {navGroups.map((group) => (
          <Collapsible
            key={group.label}
            defaultOpen={group.defaultOpen}
            className="group/collapsible mb-1"
          >
            <SidebarGroup className="px-2 py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="hover:bg-muted/60 flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors">
                  <span>{t(group.label)}</span>
                  <IconChevronRight className="size-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent className="pt-1">
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const isActive =
                        currentPath === item.url ||
                        (item.url !== "/" &&
                          currentPath.startsWith(`${item.url}/`))
                      return (
                        <SidebarMenuItem key={item.title}>
                          {item.feature === "agent_editor" ? (
                            <AgentSelectorNavItem
                              agentOptions={agentOptions}
                              isActive={isActive}
                              item={item}
                              onAgentChange={handleAgentChange}
                              onNavigate={handleNavItemClick}
                              selectedAgent={selectedAgent}
                              selectedAgentID={selectedAgentID}
                              title={
                                item.translateTitle === false
                                  ? item.title
                                  : t(item.title)
                              }
                            />
                          ) : (
                            <SidebarMenuButton
                              asChild
                              isActive={isActive}
                              onClick={handleNavItemClick}
                              data-tour={
                                item.url === "/models"
                                  ? "models-nav"
                                  : undefined
                              }
                              className={`h-9 px-3 ${isActive ? "bg-accent/80 text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
                            >
                              {item.external ? (
                                <a href={item.url}>
                                  <item.icon className="size-4 opacity-60" />
                                  <span className="opacity-80">
                                    {item.title}
                                  </span>
                                </a>
                              ) : (
                                <Link to={item.url}>
                                  <item.icon
                                    className={`size-4 ${isActive ? "opacity-100" : "opacity-60"}`}
                                  />
                                  <span
                                    className={
                                      isActive ? "opacity-100" : "opacity-80"
                                    }
                                  >
                                    {item.translateTitle === false
                                      ? item.title
                                      : t(item.title)}
                                  </span>
                                </Link>
                              )}
                            </SidebarMenuButton>
                          )}
                        </SidebarMenuItem>
                      )
                    })}
                    {group.isChannelsGroup && hasMoreChannels && (
                      <SidebarMenuItem key="channels-more-toggle">
                        <SidebarMenuButton
                          onClick={toggleShowAllChannels}
                          className="text-muted-foreground hover:bg-muted/60 h-9 px-3"
                        >
                          {showAllChannels ? (
                            <IconChevronsUp className="size-4 opacity-60" />
                          ) : (
                            <IconChevronsDown className="size-4 opacity-60" />
                          )}
                          <span className="opacity-80">
                            {showAllChannels
                              ? t("navigation.show_less_channels")
                              : t("navigation.show_more_channels")}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

interface AgentSelectorNavItemProps {
  agentOptions: SidebarAgentOption[]
  isActive: boolean
  item: NavItem
  onAgentChange: (agentID: string) => void
  onNavigate: () => void
  selectedAgent: SidebarAgentOption | null
  selectedAgentID: string
  title: string
}

function AgentSelectorNavItem({
  agentOptions,
  isActive,
  item,
  onAgentChange,
  onNavigate,
  selectedAgentID,
  title,
}: AgentSelectorNavItemProps) {
  const hasMultiple = agentOptions.length > 1

  return (
    <div
      className={cn(
        "flex items-center rounded-md transition-colors",
        isActive
          ? "bg-accent/80 text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/60",
      )}
      data-testid="sidebar-agent-selector"
    >
      <Link
        to={item.url}
        onClick={onNavigate}
        className="min-w-0 flex-1 px-2 py-1.5 text-sm"
      >
        <span className="block truncate">{title}</span>
      </Link>
      {hasMultiple && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Trocar agente"
              className="hover:bg-background/70 focus-visible:ring-ring mr-1 inline-flex size-6 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden group-data-[collapsible=icon]:hidden"
              data-testid="agent-selector-trigger"
            >
              <IconChevronDown className="size-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="w-52"
            data-testid="agent-selector-menu"
          >
            <DropdownMenuRadioGroup
              value={selectedAgentID}
              onValueChange={onAgentChange}
            >
              {agentOptions.map((agent) => (
                <DropdownMenuRadioItem
                  key={agent.id}
                  value={agent.id}
                  data-testid={`agent-option-${agent.id}`}
                >
                  <span className="truncate">{agent.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
