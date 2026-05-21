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
	/** Human-readable error displayed instead of an empty bubble when the
	 * model produced no text before the stream failed. */
	errorText?: string;
	createdAt: number;
};

export type ClaraExtracted = {
	companyName?: string;
	contactName?: string;
	segments: string[];
	channels: string[];
	pains: string[];
	systems: string[];

	// Light onboarding signals — rendered by ClaraFinalize as a narrative
	// mini-report. Technical detail (prices, integrations, etc.) is left for
	// Sofia's WhatsApp follow-up, NOT this screen.
	offer?: string;
	website?: string;
	instagram?: string;
	crmName?: string;
	crmNotes?: string;
	quotingPersonalized?: boolean;
	quotingNotes?: string;
	priorityAgent?: "clara" | "marcos" | "camila" | "lia" | "rafael";
	priorityReason?: string;

	// Structured pain tag (problemArea) + how the visitor sells today
	// (salesOnline + productType). Used by ClaraFinalize to render the
	// "how the agents will help" recommendations.
	problemArea?: ClaraProblemArea;
	problemAreaNote?: string;
	salesOnline?: boolean;
	productType?: string;
	salesNote?: string;
};

export type ClaraProblemArea =
	| "vendas"
	| "atendimento"
	| "suporte"
	| "agendamento"
	| "marketing"
	| "gestao";

export type ClaraStatus = "idle" | "sending" | "streaming" | "error";

// ClaraProvisioned mirrors the `tenant_provisioned` SSE event payload. Drawn
// straight from the AutoProvisioner on the controlplane after a successful
// mark_qualified. Magic-link mode just sets checkEmail=true (Supabase already
// emailed the visitor); password mode includes initialPassword for the UI to
// surface as copyable credentials.
export type ClaraProvisioned = {
	url: string;
	subdomain: string;
	email: string;
	loginMode: "magic_link" | "password";
	checkEmail?: boolean;
	initialPassword?: string;
	alreadyExists?: boolean;
};

export type ClaraProvisioningStatus =
	| "idle"
	| "provisioning"
	| "provisioned"
	| "error";

export type ClaraChatState = {
	messages: ClaraMessage[];
	status: ClaraStatus;
	error: string;
	qualified: boolean;
	qualifiedReason: string;
	extracted: ClaraExtracted;
	provisioning: ClaraProvisioningStatus;
	provisioned: ClaraProvisioned | null;
	provisionError: string;
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

function sanitizeStoredMessages(messages: ClaraMessage[]): ClaraMessage[] {
	return messages
		.filter((message) => {
			if (message.role === "user" && message.content === "Oi! Pode começar.") {
				return false;
			}
			if (message.role === "assistant" && !message.content && !message.errorText) {
				return false;
			}
			return true;
		})
		.map((message) => ({ ...message, streaming: false }));
}

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
	const messagesStorageKey = intakeId ? `clara_messages_${intakeId}` : "";

	// Hydrate from localStorage first so a refresh / "Voltar à conversa"
	// after an error never strands the visitor with an empty transcript
	// (P0.4 ticket).
	const [messages, setMessages] = useState<ClaraMessage[]>(() => {
		if (initialMessages && initialMessages.length > 0) return initialMessages;
		if (!messagesStorageKey) return [];
		try {
			const saved = localStorage.getItem(messagesStorageKey);
			if (!saved) return [];
			const parsed = JSON.parse(saved) as ClaraMessage[];
			return Array.isArray(parsed) ? sanitizeStoredMessages(parsed) : [];
		} catch {
			return [];
		}
	});

	const [status, setStatus] = useState<ClaraStatus>("idle");
	const [error, setError] = useState("");
	const [qualified, setQualified] = useState(false);
	const [qualifiedReason, setQualifiedReason] = useState("");
	const [extracted, setExtracted] = useState<ClaraExtracted>(emptyExtracted);
	const [provisioning, setProvisioning] = useState<ClaraProvisioningStatus>("idle");
	const [provisioned, setProvisioned] = useState<ClaraProvisioned | null>(null);
	const [provisionError, setProvisionError] = useState("");

	const abortRef = useRef<AbortController | null>(null);

	// Persist transcript on every change so a reload, an error, or even a
	// crash never costs the visitor their progress (P0.4 ticket).
	useEffect(() => {
		if (!messagesStorageKey) return;
		try {
			localStorage.setItem(
				messagesStorageKey,
				JSON.stringify(sanitizeStoredMessages(messages).slice(-40)),
			);
		} catch {
			// localStorage may be full or disabled in private mode; ignore.
		}
	}, [messages, messagesStorageKey]);

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

			// Phase 10 — Frontend cutover (partial).
			//
			// The tenant-side wire format is now isolated in
			// ./onboardingTenantChat.ts (openOnboardingTenantChat). When the
			// flag is on, that module handles POST + SSE-GET against the
			// public onboarding tenant. The flag is intentionally still
			// gated here because two pieces of plumbing are still missing
			// before a full cutover is correct:
			//
			//   1. intake_id ↔ session_id binding. The tenant's
			//      onboarding-mark-qualified and onboarding-submit-intake
			//      skills need to know which intake row to update via HMAC
			//      callback. The cleanest path is to use intake_id as the
			//      publicweb session_id and have the agent expose it to
			//      skill scripts via env (e.g. PICOCLAW_CHAT_SESSION_ID).
			//      Today the agent loop does not propagate session_id to
			//      skill env, so wiring this up requires a small backend
			//      change in pkg/agent/.
			//
			//   2. extracted / qualified / tenant_provisioned bridging.
			//      Today those events come inline in the legacy SSE. The
			//      tenant only emits raw text. Two options:
			//        (a) Poll GET /api/v1/public/company-intakes/{id} every
			//            few seconds while in qualified-but-not-provisioned
			//            state and synthesize the events when the intake row
			//            changes. Requires (1) so the intake is updated by
			//            the tenant's skills.
			//        (b) Enrich publicweb.Channel.Send with typed
			//            OutboundEvent variants and have the onboarding
			//            skills publish them through the bus.
			//
			// For an opt-in dev/staging cutover that ignores extracted/
			// provisioning UI (raw chat only), uncomment the route below
			// and flip the env var. Once (1) lands we can move the rest
			// of this hook to the new module.
			const _onboardingTenantFlagSet =
				import.meta.env.VITE_USE_ONBOARDING_TENANT === "true" &&
				Boolean(import.meta.env.VITE_ONBOARDING_TENANT_URL);
			void _onboardingTenantFlagSet;

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
				finalizeWithError(humanizeError(text || `erro ${response.status}`));
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
						if (typeof ev.delta === "string" && ev.delta.length > 0) {
							setMessages((prev) =>
								prev.map((m) =>
									m.id === assistantTargetId ? { ...m, content: m.content + ev.delta } : m,
								),
							);
						}
						return;
					case "extracted":
						// Authoritative snapshot from the server after a tool applied.
						setExtracted((cur) => ({
							...cur,
							companyName:
								(typeof ev.company_name === "string" && ev.company_name) || cur.companyName,
							contactName:
								(typeof ev.contact_name === "string" && ev.contact_name) || cur.contactName,
							segments: arrayOrPrev(ev.segments, cur.segments),
							channels: arrayOrPrev(ev.channels, cur.channels),
							pains: arrayOrPrev(ev.pains, cur.pains),
							systems: arrayOrPrev(ev.systems, cur.systems),
							offer: stringOrPrev(ev.offer, cur.offer),
							website: stringOrPrev(ev.website, cur.website),
							instagram: stringOrPrev(ev.instagram, cur.instagram),
							crmName: stringOrPrev(ev.crm_name, cur.crmName),
							crmNotes: stringOrPrev(ev.crm_notes, cur.crmNotes),
							quotingPersonalized:
								typeof ev.quoting_personalized === "boolean"
									? ev.quoting_personalized
									: cur.quotingPersonalized,
							quotingNotes: stringOrPrev(ev.quoting_notes, cur.quotingNotes),
							priorityAgent: priorityAgentOrPrev(ev.priority_agent, cur.priorityAgent),
							priorityReason: stringOrPrev(ev.priority_reason, cur.priorityReason),
							problemArea: problemAreaOrPrev(ev.problem_area, cur.problemArea),
							problemAreaNote: stringOrPrev(ev.problem_area_note, cur.problemAreaNote),
							salesOnline:
								typeof ev.sales_online === "boolean" ? ev.sales_online : cur.salesOnline,
							productType: stringOrPrev(ev.product_type, cur.productType),
							salesNote: stringOrPrev(ev.sales_note, cur.salesNote),
						}));
						return;
					case "tool_applied":
						// Placeholder only — the authoritative update arrives on the
						// `extracted` event that the server emits right after this one.
						if (typeof ev.name === "string") {
							setExtracted((cur) => mirrorTool(cur, ev));
						}
						return;
					case "qualified":
						setQualified(true);
						if (typeof ev.reason === "string") setQualifiedReason(ev.reason);
						return;
					case "provisioning_started":
						setProvisioning("provisioning");
						setProvisionError("");
						return;
					case "tenant_provisioned": {
						const loginMode =
							ev.login_mode === "password" ? "password" : "magic_link";
						setProvisioned({
							url: typeof ev.url === "string" ? ev.url : "",
							subdomain: typeof ev.subdomain === "string" ? ev.subdomain : "",
							email: typeof ev.email === "string" ? ev.email : "",
							loginMode,
							checkEmail: ev.check_email === true,
							initialPassword:
								typeof ev.initial_password === "string"
									? ev.initial_password
									: undefined,
						});
						setProvisioning("provisioned");
						return;
					}
					case "tenant_already_exists":
						setProvisioned({
							url: typeof ev.url === "string" ? ev.url : "",
							subdomain: typeof ev.subdomain === "string" ? ev.subdomain : "",
							email: typeof ev.email === "string" ? ev.email : "",
							loginMode: "magic_link",
							alreadyExists: true,
						});
						setProvisioning("provisioned");
						return;
					case "provision_error":
						setProvisioning("error");
						setProvisionError(
							typeof ev.message === "string"
								? ev.message
								: "não consegui criar seu painel agora",
						);
						return;
					case "warning":
						return; // truncation hint, etc. Non-fatal.
					case "tool_error":
					case "error":
						finalizeWithError(humanizeError(ev.message));
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
							? {
									...m,
									streaming: false,
									// If the model never produced any text, replace the empty
									// bubble with the humanised error so it never renders blank.
									// If it did, keep the partial text and let the error banner
									// carry the failure message.
									content: m.content || "",
									errorText: m.content ? undefined : message,
								}
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
			provisioning,
			provisioned,
			provisionError,
			send,
			cancel,
		}),
		[
			messages,
			status,
			error,
			qualified,
			qualifiedReason,
			extracted,
			provisioning,
			provisioned,
			provisionError,
			send,
			cancel,
		],
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

function mirrorTool(current: ClaraExtracted, _ev: SSEEvent): ClaraExtracted {
	// The server always follows up `tool_applied` with an `extracted` event
	// carrying the canonical answers snapshot. We no longer paint a
	// "(salvando…)" placeholder here — it confused users (P0.6 ticket) when
	// the snapshot arrived a few ms later and replaced it instantly.
	return current;
}

// arrayOrPrev keeps the previous value when the server snapshot is missing
// or not an array (defensive: we never want to drop extracted data just
// because a single SSE event was malformed).
function arrayOrPrev(v: unknown, prev: string[]): string[] {
	if (!Array.isArray(v)) return prev;
	return v.filter((x): x is string => typeof x === "string");
}

function stringOrPrev(v: unknown, prev: string | undefined): string | undefined {
	if (typeof v === "string" && v.trim() !== "") return v;
	return prev;
}

function priorityAgentOrPrev(
	v: unknown,
	prev: ClaraExtracted["priorityAgent"],
): ClaraExtracted["priorityAgent"] {
	if (
		v === "clara" ||
		v === "marcos" ||
		v === "camila" ||
		v === "lia" ||
		v === "rafael"
	) {
		return v;
	}
	return prev;
}

const PROBLEM_AREAS: ClaraProblemArea[] = [
	"vendas",
	"atendimento",
	"suporte",
	"agendamento",
	"marketing",
	"gestao",
];

function problemAreaOrPrev(
	v: unknown,
	prev: ClaraExtracted["problemArea"],
): ClaraExtracted["problemArea"] {
	if (typeof v === "string" && (PROBLEM_AREAS as string[]).includes(v)) {
		return v as ClaraProblemArea;
	}
	return prev;
}

// humanizeError maps known backend error strings to PT-BR. Anything else
// becomes a generic phrase — and any JSON-looking payload is suppressed so
// users never see raw {"error":"…"} in the UI (P0.4 ticket).
function humanizeError(raw: unknown): string {
	const s = typeof raw === "string" ? raw.trim() : "";
	if (!s) return "Algo travou aqui. Quer tentar de novo?";
	// Catch JSON literals before doing any string matching.
	if (s.startsWith("{") || s.startsWith("[")) {
		try {
			const obj = JSON.parse(s) as { error?: unknown; message?: unknown };
			const inner = obj?.error ?? obj?.message;
			if (typeof inner === "string" && !inner.startsWith("{")) {
				return humanizeError(inner);
			}
		} catch {
			// fall through
		}
		return "Algo travou aqui. Quer tentar de novo?";
	}
	const lower = s.toLowerCase();
	if (lower.includes("limite de mensagens")) {
		return "Já conversamos bastante! Vou direto para a proposta — só preciso do seu contato.";
	}
	if (lower.includes("muitas mensagens") || lower.includes("rate") || lower.includes("429")) {
		return "Muitas mensagens em pouco tempo. Espera uns instantes e tenta de novo.";
	}
	if (lower.includes("token") && lower.includes("invalid")) {
		return "Essa sessão expirou. Vou começar uma nova conversa.";
	}
	if (lower.includes("intake not found")) {
		return "Não encontrei essa conversa. Vou começar do zero.";
	}
	if (lower.includes("not configured")) {
		return "O assistente está temporariamente indisponível. Tenta de novo em alguns minutos.";
	}
	if (lower.includes("network") || lower.includes("fetch")) {
		return "Sem conexão. Verifica sua internet e tenta de novo.";
	}
	// Generic short-message fallback — never echo a long internal string.
	if (s.length > 140) {
		return "Algo travou aqui. Quer tentar de novo?";
	}
	return s;
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
	const str = (key: string): string | undefined => {
		const v = answers[key];
		return typeof v === "string" && v.trim() !== "" ? v : undefined;
	};
	const priority = (): ClaraExtracted["priorityAgent"] => {
		const v = answers["priority_agent"];
		return v === "clara" ||
			v === "marcos" ||
			v === "camila" ||
			v === "lia" ||
			v === "rafael"
			? v
			: undefined;
	};
	const quoting = (): boolean | undefined => {
		const v = answers["quoting_personalized"];
		return typeof v === "boolean" ? v : undefined;
	};
	const problemArea = (): ClaraExtracted["problemArea"] => {
		const v = answers["problem_area"];
		if (typeof v === "string" && (PROBLEM_AREAS as string[]).includes(v)) {
			return v as ClaraProblemArea;
		}
		return undefined;
	};
	const salesOnline = (): boolean | undefined => {
		const v = answers["sales_online"];
		return typeof v === "boolean" ? v : undefined;
	};
	return {
		companyName: companyName || undefined,
		contactName: contactName || undefined,
		segments: arr("segments"),
		channels: arr("channels"),
		pains: arr("pains"),
		systems: arr("systems"),
		offer: str("offer"),
		website: str("website"),
		instagram: str("instagram"),
		crmName: str("crm_name"),
		crmNotes: str("crm_notes"),
		quotingPersonalized: quoting(),
		quotingNotes: str("quoting_notes"),
		priorityAgent: priority(),
		priorityReason: str("priority_reason"),
		problemArea: problemArea(),
		problemAreaNote: str("problem_area_note"),
		salesOnline: salesOnline(),
		productType: str("product_type"),
		salesNote: str("sales_note"),
	};
}
