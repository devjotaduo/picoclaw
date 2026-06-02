import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

function stubBrowserGlobals() {
  vi.stubGlobal("WebSocket", MockWebSocket)
  vi.stubGlobal("window", {
    location: {
      protocol: "https:",
      host: "tenant.example.test",
      hostname: "tenant.example.test",
    },
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    clearTimeout,
    setTimeout,
  })
  vi.stubGlobal("localStorage", globalThis.window.localStorage)
}

async function setupConnectedChat() {
  const [{ connectChat }, { updateGatewayStore }, { updateChatStore }] =
    await Promise.all([
      import("@/features/chat/controller"),
      import("@/store/gateway"),
      import("@/store/chat"),
    ])

  updateChatStore({
    messages: [],
    connectionState: "disconnected",
    isTyping: false,
    hasHydratedActiveSession: true,
    contextUsage: undefined,
  })
  updateGatewayStore({
    status: "running",
    canStart: true,
    restartRequired: false,
  })

  await connectChat()
}

describe("sendChatMessage", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("@/i18n", () => ({
      default: {
        t: (key: string) => key,
      },
    }))
    vi.doMock("sonner", () => ({
      toast: {
        error: vi.fn(),
      },
    }))
    MockWebSocket.instances = []
    stubBrowserGlobals()
  })

  afterEach(async () => {
    const { teardownChatStore } = await import("@/features/chat/controller")
    teardownChatStore()
    vi.unstubAllGlobals()
  })

  it("shows normal user messages in chat", async () => {
    await setupConnectedChat()
    const [{ sendChatMessage }, { getChatState }] = await Promise.all([
      import("@/features/chat/controller"),
      import("@/store/chat"),
    ])

    expect(sendChatMessage({ content: "Mensagem digitada" })).toBe(true)

    expect(MockWebSocket.instances[0].sent).toHaveLength(1)
    expect(getChatState().messages).toMatchObject([
      {
        role: "user",
        content: "Mensagem digitada",
      },
    ])
    expect(getChatState().isTyping).toBe(true)
  })

  it("can send a prompt without showing it in chat", async () => {
    await setupConnectedChat()
    const [{ sendChatMessage }, { getChatState }] = await Promise.all([
      import("@/features/chat/controller"),
      import("@/store/chat"),
    ])

    expect(
      sendChatMessage({
        content: "Quero começar",
        showInChat: false,
      }),
    ).toBe(true)

    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toMatchObject({
      type: "message.send",
      payload: {
        content: "Quero começar",
        media: [],
      },
    })
    expect(getChatState().messages).toEqual([])
    expect(getChatState().isTyping).toBe(true)
  })
})
