import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	openOnboardingTenantChat,
	parseSSEFrame,
	type TenantChatEvent,
} from "@/pages/pre-cadastro/clara/onboardingTenantChat";

// Helper: build a ReadableStream<Uint8Array> that emits the given frames in
// order, with the SSE frame separator. Each chunk lands as its own enqueue
// so the parser exercises its partial-frame buffering.
function sseStream(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let i = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (i < frames.length) {
				controller.enqueue(encoder.encode(frames[i] + "\n\n"));
				i += 1;
			} else {
				controller.close();
			}
		},
	});
}

function streamResponse(body: ReadableStream<Uint8Array>): Response {
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("parseSSEFrame", () => {
	it("parses event and JSON data", () => {
		const parsed = parseSSEFrame(`event: message\ndata: {"text":"hi"}`);
		expect(parsed).toEqual({ event: "message", data: { text: "hi" } });
	});

	it("defaults event to 'message' when missing", () => {
		const parsed = parseSSEFrame(`data: {"text":"hi"}`);
		expect(parsed?.event).toBe("message");
	});

	it("ignores comment frames", () => {
		expect(parseSSEFrame(`: keepalive`)).toBeNull();
	});

	it("returns event with data=null when JSON parse fails", () => {
		const parsed = parseSSEFrame(`event: weird\ndata: not-json`);
		expect(parsed).toEqual({ event: "weird", data: null });
	});

	it("concatenates multi-line data with newlines", () => {
		const parsed = parseSSEFrame(`event: message\ndata: {"text":"a\\nb"}`);
		expect(parsed?.data).toEqual({ text: "a\nb" });
	});
});

describe("openOnboardingTenantChat", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves on the `open` SSE event and delivers messages", async () => {
		const stream = sseStream([
			`event: open\ndata: {"session_id":"sess-1"}`,
			`event: message\ndata: {"text":"oi! "}`,
			`event: message\ndata: {"text":"como posso ajudar?"}`,
			`event: close\ndata: {"reason":"stream closed"}`,
		]);

		fetchMock.mockImplementation((url: string) => {
			expect(url).toContain("/api/public/chat/stream?session_id=sess-1");
			return Promise.resolve(streamResponse(stream));
		});

		const events: TenantChatEvent[] = [];
		const chat = await openOnboardingTenantChat({
			tenantUrl: "https://onboarding.test",
			sessionId: "sess-1",
			onEvent: (e) => events.push(e),
			fetchFn: fetchMock as unknown as typeof fetch,
		});

		await chat.done;

		expect(events).toEqual([
			{ type: "open", sessionId: "sess-1" },
			{ type: "message", text: "oi! " },
			{ type: "message", text: "como posso ajudar?" },
			{ type: "close", reason: "stream closed" },
		]);
	});

	it("rejects when the GET response is non-2xx", async () => {
		fetchMock.mockResolvedValue(
			new Response("", { status: 503, statusText: "unavailable" }),
		);

		await expect(
			openOnboardingTenantChat({
				tenantUrl: "https://onboarding.test",
				sessionId: "sess-1",
				onEvent: () => {},
				fetchFn: fetchMock as unknown as typeof fetch,
			}),
		).rejects.toThrow(/503/);
	});

	it("rejects when the stream closes before the open handshake", async () => {
		// No `event: open` frame — the stream ends immediately.
		fetchMock.mockResolvedValue(streamResponse(sseStream([])));

		await expect(
			openOnboardingTenantChat({
				tenantUrl: "https://onboarding.test",
				sessionId: "sess-1",
				onEvent: () => {},
				fetchFn: fetchMock as unknown as typeof fetch,
			}),
		).rejects.toThrow(/closed before open handshake/);
	});

	it("send() POSTs to /api/public/chat with the session id and message", async () => {
		const stream = sseStream([
			`event: open\ndata: {"session_id":"sess-2"}`,
			`event: close\ndata: {"reason":"ok"}`,
		]);

		const postCalls: Array<{ url: string; init: RequestInit }> = [];
		fetchMock.mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				postCalls.push({ url, init });
				return Promise.resolve(
					new Response("", { status: 202, statusText: "Accepted" }),
				);
			}
			return Promise.resolve(streamResponse(stream));
		});

		const chat = await openOnboardingTenantChat({
			tenantUrl: "https://onboarding.test/",
			sessionId: "sess-2",
			onEvent: () => {},
			fetchFn: fetchMock as unknown as typeof fetch,
		});

		await chat.send("oi tudo bem?");

		expect(postCalls).toHaveLength(1);
		expect(postCalls[0].url).toBe("https://onboarding.test/api/public/chat");
		expect(postCalls[0].init.method).toBe("POST");
		expect(JSON.parse(postCalls[0].init.body as string)).toEqual({
			session_id: "sess-2",
			message: "oi tudo bem?",
		});
	});

	it("send() throws after close()", async () => {
		const stream = sseStream([
			`event: open\ndata: {"session_id":"sess-3"}`,
		]);

		fetchMock.mockResolvedValue(streamResponse(stream));

		const chat = await openOnboardingTenantChat({
			tenantUrl: "https://onboarding.test",
			sessionId: "sess-3",
			onEvent: () => {},
			fetchFn: fetchMock as unknown as typeof fetch,
		});

		chat.close();
		await expect(chat.send("hello")).rejects.toThrow(/closed/);
	});

	it("emits `close` with reason='aborted' when the external signal aborts", async () => {
		const controller = new AbortController();

		// Stream that never closes on its own — only the external abort can
		// terminate it. We pause indefinitely by NOT calling controller.close().
		const stream = new ReadableStream<Uint8Array>({
			start(streamController) {
				const encoder = new TextEncoder();
				streamController.enqueue(
					encoder.encode(`event: open\ndata: {"session_id":"sess-4"}\n\n`),
				);
				// Never close; rely on abort.
			},
		});

		fetchMock.mockResolvedValue(streamResponse(stream));

		const events: TenantChatEvent[] = [];
		const chat = await openOnboardingTenantChat({
			tenantUrl: "https://onboarding.test",
			sessionId: "sess-4",
			signal: controller.signal,
			onEvent: (e) => events.push(e),
			fetchFn: fetchMock as unknown as typeof fetch,
		});

		controller.abort();
		await chat.done;

		// The open event always arrives; the close event with reason=aborted
		// confirms the abort path ran.
		expect(events).toContainEqual({ type: "open", sessionId: "sess-4" });
		const closeEvent = events.find((e) => e.type === "close");
		expect(closeEvent).toBeDefined();
		expect((closeEvent as { type: "close"; reason: string }).reason).toBe("aborted");
	});
});
