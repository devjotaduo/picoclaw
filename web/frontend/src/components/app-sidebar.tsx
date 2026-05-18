import {
  IconAtom,
  IconBrandWhatsapp,
  IconChartBar,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconCopy,
  IconKey,
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
  type LauncherFeatureAccess,
  getLauncherPolicy,
} from "@/api/launcher-policy"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  const [features, setFeatures] = React.useState<Record<
    string,
    LauncherFeatureAccess
  > | null>(null)
  const [isSaasAdmin, setIsSaasAdmin] = React.useState(false)
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
        items: group.items.filter((item) => canRead(item.feature)),
      }))
      .filter((group) => group.items.length > 0)
  }, [canRead, channelItems, isSaasAdmin])

  const channelsMoreToggleTitle = showAllChannels
    ? t("navigation.show_less_channels")
    : t("navigation.show_more_channels")

  return (
    <Sidebar
      {...props}
      collapsible="icon"
      className="bg-background border-r-border/20 border-r pt-3"
    >
      <SidebarContent className="bg-background">
        {navGroups.map((group) => {
          const isFlatGroup = group.label === "navigation.agent_group"
          const menuContent = (
            <SidebarMenu>
              {group.items.map((item) => {
                      const isActive =
                        currentPath === item.url ||
                        (item.url !== "/" &&
                          currentPath.startsWith(`${item.url}/`))
                      const title =
                        item.translateTitle === false
                          ? item.title
                          : t(item.title)
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
                                  className={
                                    isActive ? "opacity-100" : "opacity-80"
                                  }
                                >
                                  {title}
                                </span>
                              </Link>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
              {group.isChannelsGroup && hasMoreChannels && (
                <SidebarMenuItem key="channels-more-toggle">
                  <SidebarMenuButton
                    onClick={toggleShowAllChannels}
                    tooltip={channelsMoreToggleTitle}
                    className="text-muted-foreground hover:bg-muted/60 h-9 px-3"
                  >
                    {showAllChannels ? (
                      <IconChevronsUp className="size-4 opacity-60" />
                    ) : (
                      <IconChevronsDown className="size-4 opacity-60" />
                    )}
                    <span className="opacity-80">
                      {channelsMoreToggleTitle}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          )

          if (isFlatGroup) {
            return (
              <SidebarGroup key={group.label} className="mb-1 px-2 py-0">
                <SidebarGroupContent className="pt-1">
                  {menuContent}
                </SidebarGroupContent>
              </SidebarGroup>
            )
          }

          return (
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
                    {menuContent}
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

