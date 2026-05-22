import { atom, getDefaultStore } from "jotai"

import { type GatewayStatusResponse, getGatewayStatus } from "@/api/gateway"

export type GatewayState =
  | "running"
  | "starting"
  | "restarting"
  | "stopping"
  | "stopped"
  | "error"
  | "unknown"

export interface GatewayStoreState {
  status: GatewayState
  canStart: boolean
  startReason?: string
  restartRequired: boolean
}

type GatewayStorePatch = Partial<GatewayStoreState>

const GATEWAY_STATE_CACHE_KEY = "picoclaw.gateway.state.v1"
const GATEWAY_STATE_CACHE_TTL_MS = 30_000

function isGatewayState(value: unknown): value is GatewayState {
  return (
    value === "running" ||
    value === "starting" ||
    value === "restarting" ||
    value === "stopping" ||
    value === "stopped" ||
    value === "error" ||
    value === "unknown"
  )
}

function readGatewayStateCache(): GatewayStoreState | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(GATEWAY_STATE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      cachedAt?: number
      state?: GatewayState
      canStart?: boolean
      startReason?: string
      restartRequired?: boolean
    }

    if (
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > GATEWAY_STATE_CACHE_TTL_MS ||
      !isGatewayState(parsed.state)
    ) {
      return null
    }

    return {
      status: parsed.state,
      canStart: typeof parsed.canStart === "boolean" ? parsed.canStart : true,
      startReason:
        typeof parsed.startReason === "string" ? parsed.startReason : undefined,
      restartRequired:
        typeof parsed.restartRequired === "boolean"
          ? parsed.restartRequired
          : false,
    }
  } catch {
    return null
  }
}

function writeGatewayStateCache(state: GatewayStoreState) {
  if (typeof window === "undefined" || state.status === "unknown") return

  try {
    window.localStorage.setItem(
      GATEWAY_STATE_CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        state: state.status,
        canStart: state.canStart,
        startReason: state.startReason,
        restartRequired: state.restartRequired,
      }),
    )
  } catch {
    // Ignore storage errors (private mode/quota/etc).
  }
}

const DEFAULT_GATEWAY_STATE: GatewayStoreState = {
  status: "unknown",
  canStart: true,
  restartRequired: false,
}

const CACHED_GATEWAY_STATE = readGatewayStateCache()
const INITIAL_GATEWAY_STATE = CACHED_GATEWAY_STATE ?? DEFAULT_GATEWAY_STATE

const GATEWAY_POLL_INTERVAL_MS = 2000
const GATEWAY_TRANSIENT_POLL_INTERVAL_MS = 1000
const GATEWAY_STOPPING_TIMEOUT_MS = 5000

interface RefreshGatewayStateOptions {
  force?: boolean
}

// Global atom for gateway state
export const gatewayAtom = atom<GatewayStoreState>(INITIAL_GATEWAY_STATE)

let gatewayPollingSubscribers = 0
let gatewayPollingTimer: ReturnType<typeof setTimeout> | null = null
let gatewayPollingRequest: Promise<void> | null = null
let gatewayStoppingTimer: ReturnType<typeof setTimeout> | null = null

function clearGatewayStoppingTimeout() {
  if (gatewayStoppingTimer !== null) {
    clearTimeout(gatewayStoppingTimer)
    gatewayStoppingTimer = null
  }
}

function normalizeGatewayStoreState(
  prev: GatewayStoreState,
  patch: GatewayStorePatch,
) {
  const next = { ...prev, ...patch }

  if (
    next.status === prev.status &&
    next.canStart === prev.canStart &&
    next.startReason === prev.startReason &&
    next.restartRequired === prev.restartRequired
  ) {
    return prev
  }

  return next
}

export function updateGatewayStore(
  patch:
    | GatewayStorePatch
    | ((prev: GatewayStoreState) => GatewayStorePatch | GatewayStoreState),
) {
  const store = getDefaultStore()
  store.set(gatewayAtom, (prev) => {
    const nextPatch = typeof patch === "function" ? patch(prev) : patch
    return normalizeGatewayStoreState(prev, nextPatch)
  })
  const nextState = store.get(gatewayAtom)
  writeGatewayStateCache(nextState)
  if (nextState?.status !== "stopping") {
    clearGatewayStoppingTimeout()
  }
}

export function beginGatewayStoppingTransition() {
  clearGatewayStoppingTimeout()
  updateGatewayStore({
    status: "stopping",
    canStart: false,
    restartRequired: false,
  })
  gatewayStoppingTimer = setTimeout(() => {
    gatewayStoppingTimer = null
    updateGatewayStore((prev) =>
      prev.status === "stopping" ? { status: "running" } : prev,
    )
    void refreshGatewayState({ force: true })
  }, GATEWAY_STOPPING_TIMEOUT_MS)
}

export function cancelGatewayStoppingTransition() {
  clearGatewayStoppingTimeout()
  updateGatewayStore((prev) =>
    prev.status === "stopping" ? { status: "running" } : prev,
  )
}

export function applyGatewayStatusToStore(
  data: Partial<
    Pick<
      GatewayStatusResponse,
      | "gateway_status"
      | "gateway_start_allowed"
      | "gateway_start_reason"
      | "gateway_restart_required"
    >
  >,
) {
  updateGatewayStore((prev) => ({
    status:
      prev.status === "stopping" && data.gateway_status === "running"
        ? "stopping"
        : (data.gateway_status ?? prev.status),
    canStart:
      prev.status === "stopping" && data.gateway_status === "running"
        ? false
        : (data.gateway_start_allowed ?? prev.canStart),
    startReason:
      prev.status === "stopping" && data.gateway_status === "running"
        ? prev.startReason
        : (data.gateway_start_reason ?? prev.startReason),
    restartRequired:
      prev.status === "stopping" && data.gateway_status === "running"
        ? false
        : (data.gateway_restart_required ?? prev.restartRequired),
  }))
}

function nextGatewayPollInterval() {
  const status = getDefaultStore().get(gatewayAtom).status
  if (
    status === "starting" ||
    status === "restarting" ||
    status === "stopping"
  ) {
    return GATEWAY_TRANSIENT_POLL_INTERVAL_MS
  }
  return GATEWAY_POLL_INTERVAL_MS
}

function scheduleGatewayPoll(delay = nextGatewayPollInterval()) {
  if (gatewayPollingSubscribers === 0) {
    return
  }

  if (gatewayPollingTimer !== null) {
    clearTimeout(gatewayPollingTimer)
  }

  gatewayPollingTimer = setTimeout(() => {
    gatewayPollingTimer = null
    void refreshGatewayState()
  }, delay)
}

export async function refreshGatewayState(
  options: RefreshGatewayStateOptions = {},
) {
  if (gatewayPollingRequest) {
    await gatewayPollingRequest
    if (options.force) {
      return refreshGatewayState()
    }
    return getDefaultStore().get(gatewayAtom)
  }

  gatewayPollingRequest = (async () => {
    try {
      const status = await getGatewayStatus()
      applyGatewayStatusToStore(status)
    } catch {
      // Preserve the last known state when a poll fails.
    } finally {
      gatewayPollingRequest = null
      scheduleGatewayPoll()
    }
  })()

  try {
    await gatewayPollingRequest
  } finally {
    if (gatewayPollingSubscribers === 0 && gatewayPollingTimer !== null) {
      clearTimeout(gatewayPollingTimer)
      gatewayPollingTimer = null
    }
  }

  return getDefaultStore().get(gatewayAtom)
}

export function subscribeGatewayPolling() {
  gatewayPollingSubscribers += 1
  if (gatewayPollingSubscribers === 1) {
    void refreshGatewayState()
  }

  return () => {
    gatewayPollingSubscribers = Math.max(0, gatewayPollingSubscribers - 1)
    if (gatewayPollingSubscribers === 0 && gatewayPollingTimer !== null) {
      clearTimeout(gatewayPollingTimer)
      gatewayPollingTimer = null
    }
  }
}
