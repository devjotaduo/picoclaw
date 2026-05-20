// ClaraChat is the chat-first conversational pre-cadastro screen. It replaces
// the legacy script-driven wizard with a single shared input box and bubbles
// for the agent's streaming responses. UX goals:
//   * one centered column on desktop, full-height on mobile
//   * Enter sends, Shift+Enter inserts newline
//   * focus returns to the composer after every assistant turn
//   * aria-live="polite" so screen readers narrate streamed deltas
//   * transparency Sheet shows what the agent extracted so far

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Send,
	Sparkles,
	CheckCircle2,
	AlertCircle,
	X,
	Copy,
	ExternalLink,
	Mail,
	Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// saas-admin's badge/skeleton barrels export domain-specific variants only
// (StatusBadge, SkeletonRow…). For the chat surface we want neutral, generic
// chips and a placeholder block, so we inline-style them here rather than
// extend the shared UI module.
function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-normal text-zinc-700">
			{children}
		</span>
	);
}

function EmptyPanel() {
	return (
		<div className="space-y-2 opacity-60">
			<div className="h-3 w-32 animate-pulse rounded bg-zinc-200" />
			<div className="h-3 w-48 animate-pulse rounded bg-zinc-200" />
			<div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
		</div>
	);
}

import {
	useClaraChat,
	extractFromIntake,
	type ClaraChatState,
	type ClaraExtracted,
	type ClaraMessage,
	type ClaraProvisioned,
	type ClaraProvisioningStatus,
} from "./useClaraChat";

export type ClaraChatProps = {
	intakeId: string;
	resumeToken: string;
	contactName?: string;
	companyName?: string;
	/** Whatever already sits in company_intakes.answers JSON. Hydrates the side panel. */
	answers?: Record<string, unknown>;
	/** Optional resume of prior chat_messages, in their stored order. */
	initialMessages?: ClaraMessage[];
	/** Fires when the agent's mark_qualified tool succeeds. The parent then
	 * shows the finalize step (contact email/whatsapp confirmation). The
	 * extracted snapshot is included so the parent can render the summary
	 * card without re-deriving it from useClaraChat. */
	onQualified?: (reason: string, extracted: ClaraExtracted) => void;
};

export function ClaraChat(props: ClaraChatProps) {
	const chat = useClaraChat({
		intakeId: props.intakeId,
		resumeToken: props.resumeToken,
		initialMessages: props.initialMessages,
	});

	// Hydrate extracted side panel from persisted answers when the component
	// mounts and whenever the parent passes a fresh snapshot in. Declared
	// above the qualification effect so we can hand the merged snapshot to
	// the parent without re-deriving it inside the callback.
	const hydratedExtractedEarly = useMemo(
		() => extractFromIntake(props.answers ?? null, props.contactName ?? "", props.companyName ?? ""),
		[props.answers, props.contactName, props.companyName],
	);
	const mergedExtractedEarly = useMemo(
		() => mergeExtracted(hydratedExtractedEarly, chat.extracted),
		[hydratedExtractedEarly, chat.extracted],
	);

	// Surface qualification upward exactly once per session.
	const lastNotified = useRef(false);
	useEffect(() => {
		if (chat.qualified && !lastNotified.current) {
			lastNotified.current = true;
			props.onQualified?.(chat.qualifiedReason, mergedExtractedEarly);
		}
	}, [chat.qualified, chat.qualifiedReason, mergedExtractedEarly, props]);

	// Greet on first paint when the transcript is empty so the agent isn't
	// silent waiting for the user to type first.
	const seededFirstTurn = useRef(false);
	useEffect(() => {
		if (seededFirstTurn.current) return;
		if (chat.messages.length > 0) {
			seededFirstTurn.current = true;
			return;
		}
		seededFirstTurn.current = true;
		void chat.send("Oi! Pode começar.");
	}, [chat]);

	// Reuse the already-computed merged snapshot from the qualification effect
	// above. The Sheet renders the same data, so a second memo would only
	// double the work without changing behaviour.
	const mergedExtracted = mergedExtractedEarly;

	const [summaryOpen, setSummaryOpen] = useState(false);

	return (
		<div className="flex h-[100dvh] flex-col bg-zinc-50">
			<ChatHeader
				online={chat.status !== "error"}
				onOpenSummary={() => setSummaryOpen(true)}
				summaryAvailable={hasAnyExtracted(mergedExtractedEarly)}
			/>

			<MessageList chat={chat} />

			<LimitWarning chat={chat} />

			<ProvisionBanner
				intakeId={props.intakeId}
				resumeToken={props.resumeToken}
				status={chat.provisioning}
				provisioned={chat.provisioned}
				error={chat.provisionError}
			/>

			<ErrorBanner error={chat.error} />

			<Composer
				disabled={chat.status === "sending" || chat.status === "streaming"}
				onSend={(text) => void chat.send(text)}
				qualified={chat.qualified}
			/>

			<SummarySheet
				open={summaryOpen}
				onClose={() => setSummaryOpen(false)}
				extracted={mergedExtracted}
			/>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Header

function ChatHeader({
	online,
	onOpenSummary,
	summaryAvailable,
}: {
	online: boolean;
	onOpenSummary: () => void;
	summaryAvailable: boolean;
}) {
	return (
		<header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
			<div className="mx-auto flex max-w-2xl items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="relative">
						<div
							className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-base font-semibold text-white"
							role="img"
							aria-label="Avatar da Clara"
						>
							C
						</div>
						{online && (
							<span
								className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
								aria-hidden="true"
							/>
						)}
					</div>
					<div>
						<p className="text-sm font-medium text-zinc-900">Clara</p>
						<p className="text-xs text-zinc-500">Especialista em IA &amp; automação</p>
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={onOpenSummary}
					disabled={!summaryAvailable}
					aria-label={
						summaryAvailable
							? "Ver o que a Clara entendeu até agora"
							: "Disponível depois que a Clara entender seu negócio"
					}
					title={
						summaryAvailable
							? "Ver o que a Clara entendeu até agora"
							: "Disponível depois que a Clara entender seu negócio"
					}
				>
					<Sparkles className="h-3.5 w-3.5" />
					O que entendi
				</Button>
			</div>
		</header>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages

function MessageList({ chat }: { chat: ClaraChatState }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	// Track whether the user is at the bottom so we only autoscroll when they
	// haven't manually scrolled up to read older messages.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			const threshold = 64;
			stickToBottom.current =
				el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	// Track length of last assistant message so we autoscroll on every delta
	// not just on message count changes (which only fire when a new bubble
	// appears, missing streaming updates).
	const lastAssistantLen =
		chat.messages.length > 0
			? chat.messages[chat.messages.length - 1]?.content?.length ?? 0
			: 0;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickToBottom.current) {
			// Use `auto` (instant) for streaming deltas so the user always sees
			// the newest token, and let the browser-native smoothness handle the
			// brief reflow.
			el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
		}
	}, [chat.messages.length, lastAssistantLen, chat.status]);

	const visible = chat.messages.filter(
		(m, idx) => !(idx === 0 && m.role === "user" && m.content === "Oi! Pode começar."),
	);

	return (
		<div
			ref={scrollRef}
			className="min-h-0 flex-1 overflow-y-auto"
		>
			{/* role="log" lets screen-reader users navigate as a transcript,
			    aria-live="polite" announces new messages without interrupting. */}
			<ul
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				aria-label="Conversa com a Clara"
				className="mx-auto flex max-w-2xl list-none flex-col gap-3 px-4 py-6 sm:px-6"
			>
				{visible.map((m) => (
					<MessageBubble key={m.id} message={m} />
				))}
				{chat.status === "sending" && <TypingIndicator />}
			</ul>
		</div>
	);
}

function MessageBubble({ message }: { message: ClaraMessage }) {
	if (message.role === "user") {
		if (!message.content) return null; // never paint an empty user bubble
		return (
			<li className="flex justify-end">
				<div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-2 text-sm text-white shadow-sm">
					<span className="sr-only">Você:</span>
					{message.content}
				</div>
			</li>
		);
	}

	// Assistant bubble. Hierarchy:
	//   1. content available  → render text
	//   2. still streaming    → show typing dots
	//   3. errored without text → show the humanised error in-bubble
	//   4. otherwise          → render nothing (no blank ghost bubble)
	if (message.content) {
		return (
			<li className="flex justify-start">
				<div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-200">
					<span className="sr-only">Clara:</span>
					<span className="whitespace-pre-wrap">{message.content}</span>
				</div>
			</li>
		);
	}
	if (message.streaming) {
		return (
			<li className="flex justify-start">
				<div className="rounded-2xl rounded-bl-md bg-white px-4 py-2 opacity-70 shadow-sm ring-1 ring-zinc-200">
					<span className="sr-only">Clara está digitando</span>
					<TypingDots />
				</div>
			</li>
		);
	}
	if (message.errorText) {
		return (
			<li className="flex justify-start">
				<div
					className="max-w-[85%] rounded-2xl rounded-bl-md bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200"
					role="alert"
					aria-atomic="true"
				>
					{message.errorText}
				</div>
			</li>
		);
	}
	return null;
}

function TypingIndicator() {
	return (
		<li className="flex justify-start">
			<div
				className="rounded-2xl rounded-bl-md bg-white px-4 py-2 shadow-sm ring-1 ring-zinc-200"
				aria-live="polite"
				aria-label="Clara está digitando"
			>
				<TypingDots />
			</div>
		</li>
	);
}

// LimitWarning surfaces a soft warning when the visitor is two messages away
// from CLARA_MAX_TURNS (8 user turns × 2 roles = 16) and a hard fallback when
// they hit the limit. The backend still enforces the cap; this is UX.
function LimitWarning({ chat }: { chat: ClaraChatState }) {
	const userTurns = chat.messages.filter((m) => m.role === "user" && m.content).length;
	const hardLimit = 8;
	const softThreshold = 6;
	if (userTurns < softThreshold) return null;
	if (chat.qualified) return null; // already moved on

	const reached = userTurns >= hardLimit;
	const remaining = Math.max(0, hardLimit - userTurns);

	return (
		<div
			className={cn(
				"border-t px-4 py-2 text-sm sm:px-6",
				reached ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900",
			)}
			role="status"
			aria-live="polite"
		>
			<div className="mx-auto flex max-w-2xl items-start gap-2">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
				<span>
					{reached
						? "Já conversamos bastante! Que tal eu te mandar a proposta agora?"
						: `Faltam ${remaining} ${remaining === 1 ? "mensagem" : "mensagens"} para a gente fechar — quer já pular pra proposta?`}
				</span>
			</div>
		</div>
	);
}

function TypingDots() {
	return (
		<span className="inline-flex items-center gap-1" aria-label="Clara está digitando">
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
		</span>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Composer

function Composer({
	disabled,
	onSend,
	qualified,
}: {
	disabled: boolean;
	onSend: (text: string) => void;
	qualified: boolean;
}) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSend = () => {
		const text = value.trim();
		if (!text || disabled) return;
		onSend(text);
		setValue("");
		// Reset textarea height after submit.
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	};

	const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// Auto-resize textarea up to 6 lines.
	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setValue(e.target.value);
		const t = e.target;
		t.style.height = "auto";
		t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
	};

	// Refocus the input after the agent finishes its turn.
	useEffect(() => {
		if (!disabled) textareaRef.current?.focus();
	}, [disabled]);

	const placeholder = qualified ? "Quer continuar? É só seguir 👇" : "Escreva sua mensagem…";

	return (
		<div
			className="sticky bottom-0 border-t border-zinc-200 bg-white px-4 py-3 sm:px-6"
			style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
		>
			<div className="mx-auto flex max-w-2xl items-end gap-2">
				<label htmlFor="clara-message-input" className="sr-only">
					Sua mensagem para a Clara
				</label>
				<textarea
					id="clara-message-input"
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKey}
					placeholder={placeholder}
					rows={1}
					disabled={disabled}
					aria-multiline="true"
					// Underline only misspelled words (skip-ink avoids green stripes
					// over correctly-spelled text on Chrome 121+).
					style={{ textDecorationSkipInk: "auto" }}
					className={cn(
						// Explicit text color: without it the input text inherits the
						// admin shell's near-white token (~oklch 0.97) over the same
						// background, ending at 1.05:1 contrast — invisible.
						"flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900",
						// Cap auto-resize so a long paste doesn't push the rest of the
						// chat off-screen. Internal scrollbar takes over past the cap.
						"max-h-40 overflow-y-auto",
						// Selection contrast against violet primary.
						"selection:bg-violet-200 selection:text-zinc-900",
						"placeholder:text-zinc-500",
						"focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500",
						"disabled:cursor-not-allowed disabled:opacity-60",
					)}
				/>
				<Button
					onClick={handleSend}
					disabled={disabled || value.trim() === ""}
					size="icon"
					className="h-10 w-10 shrink-0 rounded-full bg-violet-600 hover:bg-violet-700"
					aria-label="Enviar mensagem"
				>
					<Send className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Provision banner — appears once the auto-provision flow fires after
// mark_qualified. Three states:
//   * provisioning  → calm "estamos preparando seu painel" spinner
//   * provisioned   → success card with login CTA (+ resend on magic link)
//   * error         → soft warning; the operator team picks up the follow-up

function ProvisionBanner({
	intakeId,
	resumeToken,
	status,
	provisioned,
	error,
}: {
	intakeId: string;
	resumeToken: string;
	status: ClaraProvisioningStatus;
	provisioned: ClaraProvisioned | null;
	error: string;
}) {
	if (status === "idle") return null;

	if (status === "provisioning") {
		return (
			<div
				className="border-t border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 sm:px-6"
				role="status"
				aria-live="polite"
			>
				<div className="mx-auto flex max-w-2xl items-center gap-2">
					<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
					<span>Preparando seu painel agora — só um instante…</span>
				</div>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div
				className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6"
				role="status"
				aria-live="polite"
			>
				<div className="mx-auto flex max-w-2xl items-start gap-2">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					<span>
						Tive um problema técnico aqui ao montar seu painel ({error}). Sem
						stress — nossa equipe já recebeu o aviso e vai falar com você.
					</span>
				</div>
			</div>
		);
	}

	if (!provisioned) return null;

	if (provisioned.alreadyExists) {
		return (
			<ProvisionSuccessCard
				title="Você já tem painel ativo"
				subtitle={`Acessa em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine="Use o link que você já recebeu no email para entrar."
			/>
		);
	}

	if (provisioned.loginMode === "magic_link") {
		return (
			<ProvisionSuccessCard
				title="Seu painel está pronto!"
				subtitle={`Está em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine={
					provisioned.checkEmail
						? "Acabei de te mandar um link de acesso no email. Clica nele pra entrar."
						: undefined
				}
				resend={
					provisioned.checkEmail
						? { intakeId, resumeToken, email: provisioned.email }
						: undefined
				}
			/>
		);
	}

	// password mode
	return (
		<ProvisionSuccessCard
			title="Seu painel está pronto!"
			subtitle={`Está em ${friendlyURL(provisioned.url)}`}
			url={provisioned.url}
			email={provisioned.email}
			password={provisioned.initialPassword}
		/>
	);
}

function friendlyURL(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

function ProvisionSuccessCard({
	title,
	subtitle,
	url,
	email,
	password,
	secondaryLine,
	resend,
}: {
	title: string;
	subtitle: string;
	url: string;
	email: string;
	password?: string;
	secondaryLine?: string;
	resend?: { intakeId: string; resumeToken: string; email: string };
}) {
	const [copied, setCopied] = useState<"" | "email" | "password" | "all">("");
	const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">(
		"idle",
	);

	const copy = (text: string, kind: "email" | "password" | "all") => {
		if (!navigator.clipboard) return;
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(kind);
			window.setTimeout(() => setCopied(""), 1800);
		});
	};

	const doResend = async () => {
		if (!resend) return;
		setResendState("sending");
		try {
			const res = await fetch(
				`/api/v1/public/company-intakes/${encodeURIComponent(resend.intakeId)}/resend-link`,
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ resume_token: resend.resumeToken }),
				},
			);
			setResendState(res.ok ? "sent" : "error");
		} catch {
			setResendState("error");
		}
	};

	return (
		<div className="border-t border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-6">
			<div className="mx-auto max-w-2xl">
				<div className="flex items-start gap-3">
					<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
					<div className="flex-1">
						<p className="text-sm font-medium text-emerald-900">{title}</p>
						<p className="text-xs text-emerald-700">{subtitle}</p>
						{secondaryLine && (
							<p className="mt-1 text-xs text-emerald-700">{secondaryLine}</p>
						)}

						{password && (
							<dl className="mt-3 space-y-2 text-xs">
								<div className="flex items-center gap-2">
									<dt className="w-16 shrink-0 text-emerald-700">Email</dt>
									<dd className="flex flex-1 items-center gap-1">
										<code className="rounded bg-white px-1.5 py-0.5 font-mono text-emerald-900">
											{email}
										</code>
										<button
											type="button"
											onClick={() => copy(email, "email")}
											className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
											aria-label="Copiar email"
										>
											<Copy className="h-3 w-3" />
										</button>
										{copied === "email" && (
											<span className="text-emerald-600">copiado</span>
										)}
									</dd>
								</div>
								<div className="flex items-center gap-2">
									<dt className="w-16 shrink-0 text-emerald-700">Senha</dt>
									<dd className="flex flex-1 items-center gap-1">
										<code className="rounded bg-white px-1.5 py-0.5 font-mono text-emerald-900">
											{password}
										</code>
										<button
											type="button"
											onClick={() => copy(password, "password")}
											className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
											aria-label="Copiar senha"
										>
											<Copy className="h-3 w-3" />
										</button>
										{copied === "password" && (
											<span className="text-emerald-600">copiado</span>
										)}
									</dd>
								</div>
								<button
									type="button"
									onClick={() => copy(`${email}\n${password}`, "all")}
									className="mt-1 text-xs text-emerald-700 underline-offset-2 hover:underline"
								>
									Copiar email + senha
								</button>
							</dl>
						)}

						<div className="mt-3 flex flex-wrap items-center gap-2">
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
							>
								<ExternalLink className="h-3.5 w-3.5" />
								Entrar no meu painel
							</a>
							{resend && (
								<button
									type="button"
									onClick={() => void doResend()}
									disabled={resendState === "sending" || resendState === "sent"}
									className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
								>
									<Mail className="h-3.5 w-3.5" />
									{resendState === "sent"
										? "Link reenviado"
										: resendState === "sending"
											? "Enviando…"
											: resendState === "error"
												? "Tentar de novo"
												: "Reenviar link"}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Error banner

function ErrorBanner({
	error,
	onRetry,
}: {
	error: string;
	onRetry?: () => void;
}) {
	if (!error) return null;
	return (
		<div
			className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 sm:px-6"
			role="alert"
			aria-atomic="true"
		>
			<div className="mx-auto flex max-w-2xl items-start gap-2">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="flex-1">
					<p>{error}</p>
					{onRetry && (
						<button
							type="button"
							onClick={onRetry}
							className="mt-1 inline-flex text-xs font-medium underline underline-offset-2 hover:text-rose-700"
						>
							Tentar de novo
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary side panel
//
// saas-admin doesn't pull in @radix-ui/react-dialog, so we render a
// drawer-style overlay manually rather than depend on shadcn Sheet.

function SummarySheet({
	open,
	onClose,
	extracted,
}: {
	open: boolean;
	onClose: () => void;
	extracted: ClaraExtracted;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const empty =
		!extracted.companyName &&
		!extracted.contactName &&
		extracted.segments.length === 0 &&
		extracted.channels.length === 0 &&
		extracted.pains.length === 0 &&
		extracted.systems.length === 0 &&
		!extracted.problemArea &&
		typeof extracted.salesOnline !== "boolean" &&
		!extracted.productType;

	const salesChips: string[] = [];
	if (typeof extracted.salesOnline === "boolean") {
		salesChips.push(extracted.salesOnline ? "vende online" : "só presencial");
	}
	if (extracted.productType) salesChips.push(extracted.productType);

	return (
		<div className="fixed inset-0 z-50 flex">
			<button
				type="button"
				className="flex-1 bg-zinc-900/30 backdrop-blur-sm"
				aria-label="Fechar painel"
				onClick={onClose}
			/>
			<aside className="flex w-full max-w-sm flex-col bg-white shadow-xl sm:max-w-md">
				<div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
					<div>
						<p className="text-sm font-medium text-zinc-900">O que a Clara entendeu</p>
						<p className="text-xs text-zinc-500">
							A Clara salva isso enquanto vocês conversam.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"
						aria-label="Fechar"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-4">
					{empty ? (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
							<EmptyPanel />
						</div>
					) : (
						<dl className="space-y-4">
							<SummarySection
								label="Quem"
								items={[extracted.contactName, extracted.companyName].filter(Boolean) as string[]}
								icon={<CheckCircle2 className="h-3.5 w-3.5" />}
							/>
							<SummarySection label="Negócio" items={extracted.segments} />
							<SummarySection label="Como vende" items={salesChips} />
							<SummarySection label="Canais" items={extracted.channels} />
							<SummarySection
								label="Foco do problema"
								items={extracted.problemArea ? [PROBLEM_AREA_LABELS[extracted.problemArea]] : []}
							/>
							<SummarySection label="Dores" items={extracted.pains} />
							<SummarySection label="Sistemas" items={extracted.systems} />
						</dl>
					)}
				</div>
			</aside>
		</div>
	);
}

function SummarySection({
	label,
	items,
	icon,
}: {
	label: string;
	items: string[];
	icon?: React.ReactNode;
}) {
	if (items.length === 0) return null;
	return (
		<div>
			<dt className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
				{icon}
				{label}
			</dt>
			<dd className="flex flex-wrap gap-1.5">
				{items.map((it) => (
					<Chip key={it}>{it}</Chip>
				))}
			</dd>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Extracted merge: prefer server snapshot, fall back to live mirror

function hasAnyExtracted(e: ClaraExtracted): boolean {
	return Boolean(
		e.companyName ||
			e.contactName ||
			e.segments.length ||
			e.channels.length ||
			e.pains.length ||
			e.systems.length ||
			e.problemArea ||
			typeof e.salesOnline === "boolean" ||
			e.productType,
	);
}

const PROBLEM_AREA_LABELS: Record<NonNullable<ClaraExtracted["problemArea"]>, string> = {
	vendas: "Vendas",
	atendimento: "Atendimento",
	suporte: "Suporte pós-venda",
	agendamento: "Agendamento",
	marketing: "Marketing / presença",
	gestao: "Organização interna",
};

function mergeExtracted(server: ClaraExtracted, live: ClaraExtracted): ClaraExtracted {
	const pick = (s: string[], l: string[]) => (s.length > 0 ? s : l);
	const pickStr = (s: string | undefined, l: string | undefined) => s || l;
	return {
		companyName: server.companyName || live.companyName,
		contactName: server.contactName || live.contactName,
		segments: pick(server.segments, live.segments),
		channels: pick(server.channels, live.channels),
		pains: pick(server.pains, live.pains),
		systems: pick(server.systems, live.systems),
		offer: pickStr(server.offer, live.offer),
		website: pickStr(server.website, live.website),
		instagram: pickStr(server.instagram, live.instagram),
		crmName: pickStr(server.crmName, live.crmName),
		crmNotes: pickStr(server.crmNotes, live.crmNotes),
		quotingPersonalized:
			typeof server.quotingPersonalized === "boolean"
				? server.quotingPersonalized
				: live.quotingPersonalized,
		quotingNotes: pickStr(server.quotingNotes, live.quotingNotes),
		priorityAgent: server.priorityAgent || live.priorityAgent,
		priorityReason: pickStr(server.priorityReason, live.priorityReason),
		problemArea: server.problemArea || live.problemArea,
		problemAreaNote: pickStr(server.problemAreaNote, live.problemAreaNote),
		salesOnline:
			typeof server.salesOnline === "boolean" ? server.salesOnline : live.salesOnline,
		productType: pickStr(server.productType, live.productType),
		salesNote: pickStr(server.salesNote, live.salesNote),
	};
}
