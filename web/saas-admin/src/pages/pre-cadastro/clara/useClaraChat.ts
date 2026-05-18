// useClaraChat owns the SSE conversation with the saas-admin Clara endpoint.
//
// The browser's built-in EventSource cannot send a POST body, so we read the
// response stream ourselves with fetch + ReadableStream. The parsed SSE
// frames are surfaced as discrete state updates the UI can render directly.
//
// State machine per turn:
//   idle ──send()──> sending ─receive 1st chunk─> streaming ─done event─> idle
//                                                          ─error event─> error
//
// History is rendered straight from `messages`. The hook never mutates the
// transcript that already lives on the server; the server already persisted
// the user turn before opening the stream, so a dropped connection is fine.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ClaraRole = "user" | "assistant" | "system";

export type ClaraMessage = {
	id: string;
	role: ClaraRole;
	/** Streaming content. Updated as deltas arrive on assistant turns. */
	content: string;
	/** Set when this message is the assistant's first turn that is still being streamed. */
	streaming?: boolean;
	createdAt: number;
};

export type ClaraExtracted = {
	companyName?: string;
	contactName?: string;
	segments: string[];
	channels: string[];
	pains: string[];
	systems: string[];
};

export type ClaraStatus = "idle" | "sending" | "streaming" | "error";

export type ClaraChatState = {
	messages: ClaraMessage[];
	status: ClaraStatus;
	error: string;
	qualified: boolean;
	qualifiedReason: string;
	extracted: ClaraExtracted;
	send: (text: string) => Promise<void>;
	cancel: () => void;
};

export type UseClaraChatOptions = {
	intakeId: string;
	resumeToken: string;
	/**
	 * Initial messages loaded from the persisted transcript. Optional — if
	 * empty the agent opens the conversation with the system-prompted greeting
	 * on the first user message.
	 */
	initialMessages?: ClaraMessage[];
};

const emptyExtracted: ClaraExtracted = {
	segments: [],
	channels: [],
	pains: [],
	systems: [],
};

/**
 * useClaraChat returns a controller for one Clara session. The component
 * tree is responsible for owning the intakeId + resumeToken (typically via
 * useIntakeCore). The hook itself is provider-agnostic and isolated.
 */
export function useClaraChat({
	intakeId,
	resumeToken,
	initialMessages,
}: UseClaraChatOptions): ClaraChatState {
	const [messages, setMessages] = useState<ClaraMessage[]>(initialMessages ?? []);
	const [status, setStatus] = useState<ClaraStatus>("idle");
	const [error, setError] = useState("");
	const [qualified, setQualified] = useState(false);
	const [qualifiedReason, setQualifiedReason] = useState("");
	const [extracted, setExtracted] = useState<ClaraExtracted>(emptyExtracted);

	const abortRef = useRef<AbortController | null>(null);

	// Cancel any in-flight stream on unmount so a closed sheet doesn't keep
	// reading from the network indefinitely.
	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	const cancel = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setStatus((s) => (s === "idle" ? s : "idle"));
	}, []);

	const send = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed || !intakeId || !resumeToken) return;
			if (status === "sending" || status === "streaming") return;

			setError("");
			setStatus("sending");

			// Optimistic insert of the user turn so the bubble appears instantly.
			const userId = `u-${Date.now()}`;
			setMessages((prev) => [
				...prev,
				{ id: userId, role: "user", content: trimmed, createdAt: Date.now() },
			]);

			// Reserve the assistant bubble so streaming deltas have a target.
			const assistantId = `a-${Date.now()}`;
			setMessages((prev) => [
				...prev,
				{
					id: assistantId,
					role: "assistant",
					content: "",
					streaming: true,
					createdAt: Date.now(),
				},
			]);

			const abort = new AbortController();
			abortRef.current = abort;

			let response: Response;
			try {
				response = await fetch(
					`/api/v1/public/company-intakes/${encodeURIComponent(intakeId)}/chat`,
					{
						method: "POST",
						credentials: "include",
						signal: abort.signal,
						headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
						body: JSON.stringify({ message: trimmed, resume_token: resumeToken }),
					},
				);
			} catch (err) {
				if (abort.signal.aborted) return;
				finalizeWithError(err instanceof Error ? err.message : "falha de rede");
				return;
			}

			if (!response.ok || !response.body) {
				const text = await response.text().catch(() => "");
				finalizeWithError(text || `erro ${response.status}`);
				return;
			}

			setStatus("streaming");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const frames = buffer.split("\n\n");
					buffer = frames.pop() ?? ""; // keep last partial frame
					for (const frame of frames) {
						const line = frame.split("\n").find((l) => l.startsWith("data:"));
						if (!line) continue;
						const payload = line.slice(5).trim();
						if (!payload) continue;
						let event: SSEEvent;
						try {
							event = JSON.parse(payload);
						} catch {
							continue;
						}
						applyEvent(event, assistantId);
					}
				}
			} catch (err) {
				if (!abort.signal.aborted) {
					finalizeWithError(err instanceof Error ? err.message : "stream interrompido");
				}
				return;
			}

			// Stream ended normally; mark assistant as no longer streaming.
			setMessages((prev) =>
				prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
			);
			setStatus("idle");
			abortRef.current = null;

			function applyEvent(ev: SSEEvent, assistantTargetId: string) {
				switch (ev.type) {
					case "text":
						if (typeof ev.delta === "string") {
							setMessages((prev) =>
								prev.map((m) =>
									m.id === assistantTargetId ? { ...m, content: m.content + ev.delta } : m,
								),
							);
						}
						return;
					case "tool_applied":
						// Front-end mirror of the mutation: update extracted summary so the
						// transparency Sheet stays in sync without re-fetching the intake.
						if (typeof ev.name === "string") {
							setExtracted((cur) => mirrorTool(cur, ev));
						}
						return;
					case "qualified":
						setQualified(true);
						if (typeof ev.reason === "string") setQualifiedReason(ev.reason);
						return;
					case "warning":
						// Truncation hint, etc. Non-fatal.
						return;
					case "tool_error":
					case "error":
						finalizeWithError(typeof ev.message === "string" ? ev.message : "erro do agente");
						return;
					case "done":
					case "tool_start":
					case "tool_end":
					default:
						return;
				}
			}

			function finalizeWithError(message: string) {
				setError(message);
				setStatus("error");
				setMessages((prev) =>
					prev.map((m) =>
						m.id === assistantId
							? { ...m, streaming: false, content: m.content || "(erro)" }
							: m,
					),
				);
				abortRef.current = null;
			}
		},
		[intakeId, resumeToken, status],
	);

	const value = useMemo<ClaraChatState>(
		() => ({
			messages,
			status,
			error,
			qualified,
			qualifiedReason,
			extracted,
			send,
			cancel,
		}),
		[messages, status, error, qualified, qualifiedReason, extracted, send, cancel],
	);

	return value;
}

// ──────────────────────────────────────────────────────────────────────────────
// SSE event shape & helpers

type SSEEvent = {
	type: string;
	delta?: string;
	name?: string;
	reason?: string;
	message?: string;
	// tool_applied may receive a snapshot of the mutation later; for now the
	// front-end only knows which tool fired and updates the extracted view via
	// heuristics tracking *what could have been set*. The server emits the
	// authoritative state on a subsequent GET.
	[key: string]: unknown;
};

function mirrorTool(current: ClaraExtracted, ev: SSEEvent): ClaraExtracted {
	// We deliberately don't have field-level visibility into the tool args at
	// the event boundary (the SSE only carries the tool name + an "applied"
	// flag). This is a pragmatic mirror: when the agent fires a tool, we mark
	// the corresponding category as "in progress" with a placeholder so the
	// transparency Sheet doesn't stay empty between turns. A full refresh
	// happens whenever the parent reloads the intake (e.g. after qualified).
	const name = String(ev.name ?? "");
	if (name === "set_identity") return current;
	if (name === "set_business" && current.segments.length === 0) {
		return { ...current, segments: ["(salvando…)"] };
	}
	if (name === "set_channels" && current.channels.length === 0) {
		return { ...current, channels: ["(salvando…)"] };
	}
	if (name === "set_pain" && current.pains.length === 0) {
		return { ...current, pains: ["(salvando…)"] };
	}
	if (name === "set_systems" && current.systems.length === 0) {
		return { ...current, systems: ["(salvando…)"] };
	}
	return current;
}

/**
 * extractFromIntake mirrors company_intakes.answers into ClaraExtracted so
 * the transparency view stays accurate after a server refresh.
 */
export function extractFromIntake(
	answers: Record<string, unknown> | undefined | null,
	contactName: string,
	companyName: string,
): ClaraExtracted {
	if (!answers) return emptyExtracted;
	const arr = (key: string): string[] => {
		const v = answers[key];
		if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
		return [];
	};
	return {
		companyName: companyName || undefined,
		contactName: contactName || undefined,
		segments: arr("segments"),
		channels: arr("channels"),
		pains: arr("pains"),
		systems: arr("systems"),
	};
}
