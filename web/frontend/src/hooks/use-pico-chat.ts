import dayjs from "dayjs"
import { useAtomValue } from "jotai"

import {
  newChatSession,
  sendAgentChatMessage,
  sendChatMessage,
  switchChatSession,
} from "@/features/chat/controller"
import { normalizeUnixTimestamp } from "@/features/chat/state"
import { chatAtom } from "@/store/chat"

function parseTimestamp(dateRaw: number | string | Date) {
  if (typeof dateRaw === "number") {
    return dayjs(normalizeUnixTimestamp(dateRaw))
  }

  if (typeof dateRaw === "string") {
    const trimmed = dateRaw.trim()
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed)
      if (Number.isFinite(numeric)) {
        return dayjs(normalizeUnixTimestamp(numeric))
      }
    }
    return dayjs(trimmed)
  }

  return dayjs(dateRaw)
}

export function formatMessageTime(dateRaw: number | string | Date): string {
  const date = parseTimestamp(dateRaw)
  if (!date.isValid()) {
    return ""
  }
  const now = dayjs()

  const isToday = date.isSame(now, "day")
  const isThisYear = date.isSame(now, "year")

  if (isToday) {
    return date.format("LT")
  }

  if (isThisYear) {
    return date.format("MMM D LT")
  }

  return date.format("ll LT")
}

export function usePicoChat() {
  const { messages, connectionState, isTyping, activeSessionId, contextUsage } =
    useAtomValue(chatAtom)

  return {
    messages,
    connectionState,
    isTyping,
    activeSessionId,
    contextUsage,
    sendMessage: sendChatMessage,
    sendAgentMessage: sendAgentChatMessage,
    switchSession: switchChatSession,
    newChat: newChatSession,
  }
}
