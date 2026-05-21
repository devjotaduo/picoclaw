// Onboarding-tenant SSE adapter.
//
// The public onboarding tenant (pkg/channels/publicweb) speaks a different
// SSE shape than the legacy /api/v1/public/company-intakes/{id}/chat
// endpoint. This module isolates the tenant-side wire format so
// useClaraChat doesn't grow a second nested protocol parser.
//
// Tenant SSE contract (see pkg/channels/publicweb/http.go):
//   event: open      data: {"session_id":"..."}
//   event: message   data: {"text":"..."}           ← one chunk per agent reply
//   event: close     data: {"reason":"..."}
//   (15s keepalive comments — ignored)
//
// vs. the legacy contract embedded JSON-on-data with a `type` field, no
// event line. See useClaraChat::SSEEvent for the legacy shape.
//
// What this module covers:
//   * POST /api/public/chat            → push a visitor message (202 ack)
//   * GET  /api/public/chat/stream     → long-lived SSE for agent replies
//   * Typed event dispatch via onEvent
//   * Abort + clean close semantics
//
// What this module deliberately does NOT cover:
//   * Mapping tenant events onto legacy `extracted`/`qualified`/
//     `tenant_provisioned` events. Those come from the controlplane intake
//     row, which is updated when Clara's mark-qualified / submit-intake
//     skills HMAC-call back. Wire-up needs a polling layer or richer
//     events emitted by publicweb.Channel.Send — both out of scope here.
//   * intake_id ↔ session_id binding. The caller decides which opaque
//     string to use as session_id (typically the intake_id itself so the
//     agent's skill scripts can pick it up from $PICOCLAW_VISITOR_IP-style
//     env injection).

export type TenantChatEvent =
	| { type: "open"; sessionId: string }
	| { type: "message"; text: string }
	| { type: "close"; reason: string };

export type OnboardingTenantChat = {
	/** Push a visitor message. Resolves once the tenant has acknowledged (202). */
	send: (message: string) => Promise<void>;
	/** Tear down the SSE stream. Idempotent. */
	close: () => void;
	/** Resolves when the stream closes (server `event: close`, network error, or close()). */
	done: Promise<void>;
};

export type OpenOnboardingTenantChatOptions = {
	/** Base URL of the tenant, e.g. "https://onboarding.jotaduo.com". No trailing slash. */
	tenantUrl: string;
	/** Opaque visitor session id. Shared between POST and GET stream. */
	sessionId: string;
	/** Called for each typed event the tenant emits. */
	onEvent: (e: TenantChatEvent) => void;
	/** Optional external abort signal. Aborting closes the stream. */
	signal?: AbortSignal;
	/**
	 * fetch override for testing. Defaults to global fetch.
	 * Both POST and GET requests are routed through this.
	 */
	fetchFn?: typeof fetch;
};

const OPEN_HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * Opens a long-lived SSE connection to the public onboarding tenant and
 * returns an interface for sending messages and observing typed events.
 *
 * Resolves only AFTER the tenant emits its `open` event — that proves the
 * stream is subscribed and ready to receive replies, so the first POST
 * won't have its response dropped by publicweb.Channel.Send's no-subscriber
 * branch (see pkg/channels/publicweb/publicweb.go ErrNoStream).
 *
 * Rejects on:
 *   * fetch error for the GET request
 *   * non-200 status on the GET
 *   * no `open` event within OPEN_HANDSHAKE_TIMEOUT_MS
 *   * external signal aborting before handshake completes
 */
export async function openOnboardingTenantChat(
	opts: OpenOnboardingTenantChatOptions,
): Promise<OnboardingTenantChat> {
	const baseUrl = opts.tenantUrl.replace(/\/+$/, "");
	const fetchFn = opts.fetchFn ?? fetch;
	const internalAbort = new AbortController();
	const composedSignal = composeAbortSignals(opts.signal, internalAbort.signal);

	const streamURL = `${baseUrl}/api/public/chat/stream?session_id=${encodeURIComponent(opts.sessionId)}`;
	const response = await fetchFn(streamURL, {
		method: "GET",
		credentials: "omit",
		headers: { Accept: "text/event-stream" },
		signal: composedSignal,
	});
	if (!response.ok || !response.body) {
		throw new Error(`tenant stream failed: ${response.status}`);
	}

	// Wire the reader to a typed-event dispatch. The promise we expose as
	// `done` resolves when the reader finishes (network close, server
	// `event: close`, or external abort).
	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	// Cancel the reader when the abort fires. fetch's own abort propagation
	// works for real network responses, but in-memory streams (tests, and
	// service-worker-intercepted responses) don't propagate, so we wire it
	// explicitly. cancel() rejects the pending read() and the catch below
	// surfaces a `close` event with reason="aborted".
	const onAbort = () => {
		try {
			void reader.cancel();
		} catch {
			// reader may already be closed — harmless.
		}
	};
	if (composedSignal.aborted) {
		onAbort();
	} else {
		composedSignal.addEventListener("abort", onAbort, { once: true });
	}

	let resolveOpen: (sessionId: string) => void = () => {};
	let rejectOpen: (err: Error) => void = () => {};
	const handshake = new Promise<string>((res, rej) => {
		resolveOpen = res;
		rejectOpen = rej;
	});
	// Time out the handshake so a hung GET doesn't strand the caller forever.
	const handshakeTimer = setTimeout(() => {
		rejectOpen(new Error("tenant stream handshake timed out"));
		internalAbort.abort();
	}, OPEN_HANDSHAKE_TIMEOUT_MS);

	let handshakeDone = false;

	let closeEmitted = false;
	const emitClose = (reason: string) => {
		if (closeEmitted) return;
		closeEmitted = true;
		opts.onEvent({ type: "close", reason });
	};

	const done = (async () => {
		let buffer = "";
		try {
			while (true) {
				const { value, done: readerDone } = await reader.read();
				if (readerDone) break;
				buffer += decoder.decode(value, { stream: true });
				const frames = buffer.split("\n\n");
				buffer = frames.pop() ?? "";
				for (const frame of frames) {
					const parsed = parseSSEFrame(frame);
					if (!parsed) continue;
					if (parsed.event === "open") {
						if (!handshakeDone) {
							handshakeDone = true;
							clearTimeout(handshakeTimer);
							resolveOpen(typeof parsed.data?.session_id === "string" ? parsed.data.session_id : opts.sessionId);
						}
						opts.onEvent({
							type: "open",
							sessionId: typeof parsed.data?.session_id === "string" ? parsed.data.session_id : opts.sessionId,
						});
					} else if (parsed.event === "message") {
						const text = typeof parsed.data?.text === "string" ? parsed.data.text : "";
						if (text) opts.onEvent({ type: "message", text });
					} else if (parsed.event === "close") {
						const reason = typeof parsed.data?.reason === "string" ? parsed.data.reason : "stream closed";
						emitClose(reason);
						return; // server-initiated close: stop reading.
					}
					// Unknown event types are intentionally ignored — the tenant
					// may add new ones (e.g. typed extracted/provisioned events
					// in a future refactor) without breaking this client.
				}
			}
			// Reader returned done=true without a server-side close event —
			// either the upstream closed the connection cleanly or our own
			// abort path cancelled it.
			emitClose(composedSignal.aborted ? "aborted" : "stream ended");
		} catch (err) {
			// Abort propagation on real fetch responses throws here; treat it
			// as a graceful close. Real network errors surface their message.
			if (composedSignal.aborted) {
				emitClose("aborted");
			} else {
				const msg = err instanceof Error ? err.message : "stream interrupted";
				emitClose(msg);
			}
		} finally {
			clearTimeout(handshakeTimer);
			if (!handshakeDone) {
				rejectOpen(new Error("tenant stream closed before open handshake"));
			}
			composedSignal.removeEventListener?.("abort", onAbort);
			try {
				void reader.cancel();
			} catch {
				// reader.cancel rejects if already cancelled — harmless.
			}
		}
	})();

	// Wait for the open handshake (or fail fast).
	await handshake;

	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		internalAbort.abort();
	};

	const send = async (message: string) => {
		if (closed) {
			throw new Error("tenant chat closed");
		}
		const postURL = `${baseUrl}/api/public/chat`;
		const resp = await fetchFn(postURL, {
			method: "POST",
			credentials: "omit",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ session_id: opts.sessionId, message }),
			signal: composedSignal,
		});
		if (resp.status !== 202 && !resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(text || `tenant POST failed: ${resp.status}`);
		}
	};

	return { send, close, done };
}

type ParsedSSEFrame = {
	event: string;
	data: Record<string, unknown> | null;
};

/**
 * parseSSEFrame extracts the `event:` line and the JSON `data:` line of a
 * single SSE frame. Multi-line data and comment-only frames return null.
 *
 * Exported for tests; not part of the public API contract.
 */
export function parseSSEFrame(frame: string): ParsedSSEFrame | null {
	const lines = frame.split("\n");
	let event = "message"; // SSE default when no `event:` line
	let dataLine = "";
	for (const raw of lines) {
		const line = raw.trim();
		if (line === "" || line.startsWith(":")) continue;
		if (line.startsWith("event:")) {
			event = line.slice("event:".length).trim();
		} else if (line.startsWith("data:")) {
			// Concatenate multi-line data with a newline per the SSE spec.
			dataLine = dataLine ? `${dataLine}\n${line.slice("data:".length).trim()}` : line.slice("data:".length).trim();
		}
	}
	if (!dataLine) return null;
	try {
		const data = JSON.parse(dataLine) as Record<string, unknown>;
		return { event, data };
	} catch {
		// Non-JSON data — surface the event with null data so callers can
		// react if they care (we ignore in the dispatcher above).
		return { event, data: null };
	}
}

/**
 * composeAbortSignals returns a single signal that aborts when ANY of the
 * input signals aborts. Useful for joining an external user-supplied abort
 * with an internal close-on-error abort. Tolerant of undefined inputs.
 */
function composeAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
	// Prefer the standard `AbortSignal.any` when available (Chrome 116+,
	// Node 20+). Fall back to a manual proxy for older environments.
	const filtered = signals.filter((s): s is AbortSignal => Boolean(s));
	type AbortSignalCtor = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };
	const ctor = AbortSignal as AbortSignalCtor;
	if (typeof ctor.any === "function") {
		return ctor.any(filtered);
	}
	const controller = new AbortController();
	for (const s of filtered) {
		if (s.aborted) {
			controller.abort();
			break;
		}
		s.addEventListener("abort", () => controller.abort(), { once: true });
	}
	return controller.signal;
}
