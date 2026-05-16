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
  accentClassName: string
}

const selectedAgentStorageKey = "picoclaw.sidebar.selectedAgent"

const sidebarAgentOptions: SidebarAgentOption[] = [
  {
    id: "claude-opus",
    label: "Claude Opus",
    shortLabel: "Opus",
    initials: "CO",
    accentClassName:
      "bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-300",
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    shortLabel: "Sonnet",
    initials: "CS",
    accentClassName:
      "bg-rose-500/15 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  },
  {
    id: "gpt-5-5",
    label: "GPT-5.5",
    shortLabel: "GPT",
    initials: "G5",
    accentClassName:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  },
  {
    id: "gemini-flash",
    label: "Gemini Flash",
    shortLabel: "Gemini",
    initials: "GF",
    accentClassName:
      "bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  },
]

function getStoredSidebarAgentID() {
  const fallback = sidebarAgentOptions[0].id
  if (typeof window === "undefined") {
    return fallback
  }

  try {
    const stored = window.localStorage.getItem(selectedAgentStorageKey)
    return stored && sidebarAgentOptions.some((agent) => agent.id === stored)
      ? stored
      : fallback
  } catch {
    return fallback
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
    label: "navigation.services",
    defaultOpen: true,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const routerState = useRouterState()
  const { i18n, t } = useTranslation()
  const { isMobile, setOpenMobile } = useSidebar()
  const currentPath = routerState.location.pathname
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

  const canRead = React.useCallback(
    (feature: string) => {
      if (!features) {
        return true
      }
      const access = features[feature]
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
      sidebarAgentOptions.find((agent) => agent.id === selectedAgentID) ??
      sidebarAgentOptions[0],
    [selectedAgentID],
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
            feature: "channels",
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
            title: "navigation.orchestration",
            url: "/agent/orchestration",
            icon: IconRobot,
            feature: "internal_agents",
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
            feature: "whatsapp_inbox",
            translateTitle: true,
          },
          {
            title: "navigation.hub",
            url: "/agent/hub",
            icon: IconSearch,
            feature: "tools",
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
            feature: "agent_templates",
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
            feature: "skills",
            translateTitle: true,
          },
          {
            title: "navigation.tools",
            url: "/agent/tools",
            icon: IconTools,
            feature: "tools",
            translateTitle: true,
          },
        ],
      },
      {
        ...baseNavGroups[3],
        items: [
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
  isActive: boolean
  item: NavItem
  onAgentChange: (agentID: string) => void
  onNavigate: () => void
  selectedAgent: SidebarAgentOption
  selectedAgentID: string
  title: string
}

function AgentSelectorNavItem({
  isActive,
  item,
  onAgentChange,
  onNavigate,
  selectedAgent,
  selectedAgentID,
  title,
}: AgentSelectorNavItemProps) {
  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5 transition-colors group-data-[collapsible=icon]:px-1",
        isActive
          ? "bg-accent/80 text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/60",
      )}
      data-testid="sidebar-agent-selector"
    >
      <div className="flex min-w-0 items-start gap-2 group-data-[collapsible=icon]:justify-center">
        <div className="flex w-9 shrink-0 flex-col items-center gap-1 group-data-[collapsible=icon]:w-8">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Select agent: ${selectedAgent.label}`}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md text-[10px] font-semibold ring-1 transition-colors hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                  selectedAgent.accentClassName,
                )}
                data-testid="agent-selector-trigger"
              >
                {selectedAgent.initials}
                <IconChevronDown className="absolute right-0.5 bottom-0.5 size-2.5 opacity-70" />
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
                {sidebarAgentOptions.map((agent) => (
                  <DropdownMenuRadioItem
                    key={agent.id}
                    value={agent.id}
                    data-testid={`agent-option-${agent.id}`}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ring-1",
                        agent.accentClassName,
                      )}
                    >
                      {agent.initials}
                    </span>
                    <span className="truncate">{agent.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span
            className="bg-background/70 max-w-9 rounded px-1 text-[9px] leading-4 font-medium text-foreground/70 ring-1 ring-border/50 group-data-[collapsible=icon]:hidden"
            data-testid="selected-agent-badge"
          >
            {selectedAgent.shortLabel}
          </span>
        </div>
        <Link
          to={item.url}
          onClick={onNavigate}
          className="min-w-0 flex-1 pt-1 group-data-[collapsible=icon]:hidden"
        >
          <span
            className={cn(
              "block truncate text-sm",
              isActive ? "opacity-100" : "opacity-80",
            )}
          >
            {title}
          </span>
          <span className="block truncate text-[11px] leading-4 text-muted-foreground/70">
            {selectedAgent.label}
          </span>
        </Link>
      </div>
    </div>
  )
}
