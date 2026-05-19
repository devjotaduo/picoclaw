import {
  IconBrandChrome,
  IconBrandDingtalk,
  IconBrandDiscord,
  IconBrandLine,
  IconBrandMatrix,
  IconBrandQq,
  IconBrandSlack,
  IconBrandTelegram,
  IconBrandWechat,
  IconBrandWhatsapp,
  IconCamera,
  IconMessages,
  IconPlug,
  IconRobot,
} from "@tabler/icons-react"
import type { TFunction } from "i18next"
import { useAtomValue } from "jotai"
import * as React from "react"

import {
  type SupportedChannel,
  getChannelsCatalog,
  getChannelsStatus,
} from "@/api/channels"
import { getChannelDisplayName } from "@/components/channels/channel-display-name"
import { gatewayAtom } from "@/store/gateway"

const DEFAULT_VISIBLE_CHANNELS = 4
const CHANNEL_IMPORTANCE_TAIL = [
  "slack",
  "line",
  "wecom",
  "dingtalk",
  "qq",
  "onebot",
  "matrix",
  "pico",
  "maixcam",
  "irc",
  "whatsapp",
  "whatsapp_native",
]

function getChannelImportanceOrder(language: string): string[] {
  const priority = language.startsWith("zh")
    ? ["feishu", "weixin", "discord", "telegram"]
    : ["discord", "telegram", "feishu", "weixin"]
  return [...priority, ...CHANNEL_IMPORTANCE_TAIL]
}

function IconLark({ className }: { className?: string }) {
  return React.createElement("span", {
    className,
    "aria-hidden": "true",
    style: {
      display: "inline-block",
      backgroundColor: "currentColor",
      mask: "url(/lark.svg) center / contain no-repeat",
      WebkitMask: "url(/lark.svg) center / contain no-repeat",
    } as React.CSSProperties,
  })
}

const CHANNEL_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  telegram: IconBrandTelegram,
  discord: IconBrandDiscord,
  slack: IconBrandSlack,
  feishu: IconLark,
  dingtalk: IconBrandDingtalk,
  line: IconBrandLine,
  qq: IconBrandQq,
  weixin: IconBrandWechat,
  wecom: IconBrandWechat,
  whatsapp: IconBrandWhatsapp,
  whatsapp_native: IconBrandWhatsapp,
  matrix: IconBrandMatrix,
  maixcam: IconCamera,
  onebot: IconRobot,
  pico: IconBrandChrome,
  irc: IconMessages,
}

export interface SidebarChannelNavItem {
  key: string
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface UseSidebarChannelsOptions {
  language: string
  t: TFunction
  isSaasAdmin: boolean
}

const TENANT_ALLOWED_CHANNELS = new Set(["whatsapp_native"])

export function useSidebarChannels({
  language,
  t,
  isSaasAdmin,
}: UseSidebarChannelsOptions) {
  const gateway = useAtomValue(gatewayAtom)
  const [channels, setChannels] = React.useState<SupportedChannel[]>([])
  const [enabledMap, setEnabledMap] = React.useState<Record<string, boolean>>(
    {},
  )
  const [showAllChannels, setShowAllChannels] = React.useState(false)

  const reloadChannels = React.useCallback((shouldApply?: () => boolean) => {
    Promise.all([
      getChannelsCatalog(),
      getChannelsStatus().catch(() => ({ channels: [] })),
    ])
      .then(([catalog, status]) => {
        if (shouldApply && !shouldApply()) {
          return
        }
        setChannels(catalog.channels)
        setEnabledMap(
          Object.fromEntries(
            status.channels.map((channel) => [channel.name, channel.enabled]),
          ),
        )
      })
      .catch(() => {
        if (shouldApply && !shouldApply()) {
          return
        }
        setChannels([])
        setEnabledMap({})
      })
  }, [])

  React.useEffect(() => {
    let active = true
    reloadChannels(() => active)
    return () => {
      active = false
    }
  }, [reloadChannels])

  const previousGatewayStatusRef = React.useRef(gateway.status)
  React.useEffect(() => {
    const previousStatus = previousGatewayStatusRef.current
    if (previousStatus !== "running" && gateway.status === "running") {
      reloadChannels()
    }
    previousGatewayStatusRef.current = gateway.status
  }, [gateway.status, reloadChannels])

  const channelImportanceIndex = React.useMemo(() => {
    return new Map(
      getChannelImportanceOrder(language).map((name, index) => [name, index]),
    )
  }, [language])

  const sortedChannels = React.useMemo(() => {
    const list = isSaasAdmin
      ? [...channels]
      : channels.filter((c) => TENANT_ALLOWED_CHANNELS.has(c.name))
    list.sort((a, b) => {
      const aEnabled = enabledMap[a.name] === true
      const bEnabled = enabledMap[b.name] === true
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1
      }

      const aImportance =
        channelImportanceIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER
      const bImportance =
        channelImportanceIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER
      if (aImportance !== bImportance) {
        return aImportance - bImportance
      }

      return getChannelDisplayName(a, t).localeCompare(
        getChannelDisplayName(b, t),
      )
    })
    return list
  }, [channelImportanceIndex, channels, enabledMap, isSaasAdmin, t])

  const hasMoreChannels = sortedChannels.length > DEFAULT_VISIBLE_CHANNELS
  const visibleChannels = showAllChannels
    ? sortedChannels
    : sortedChannels.slice(0, DEFAULT_VISIBLE_CHANNELS)

  const channelItems = React.useMemo<SidebarChannelNavItem[]>(
    () =>
      visibleChannels.map((channel) => ({
        key: channel.name,
        title: getChannelDisplayName(channel, t),
        url: `/channels/${channel.name}`,
        icon: CHANNEL_ICON_MAP[channel.name] ?? IconPlug,
      })),
    [t, visibleChannels],
  )

  const toggleShowAllChannels = React.useCallback(() => {
    setShowAllChannels((prev) => !prev)
  }, [])

  return {
    channelItems,
    hasMoreChannels,
    showAllChannels,
    toggleShowAllChannels,
  }
}
