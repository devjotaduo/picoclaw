// ClaraChat is the Sofia public-onboarding screen — Brazilian editorial
// paper aesthetic (cream + serif + forest green rule) over the same
// useClaraChat state machine the legacy implementation used. Functional
// pieces preserved: SSE streaming, qualified callback, provision banner,
// resend magic link, summary side-panel. Visual layer replaced.

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

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
	/** Fires when the agent's mark_qualified tool succeeds. */
	onQualified?: (reason: string, extracted: ClaraExtracted) => void;
};

// User can chat up to this many turns before backend (ClaraMaxTurns) replies
// with 429. Backend default is now 60 user turns; we soft-warn at 50 and hard
// at 56 to give visitors a final nudge before the cap. Keep these <= the
// backend default to avoid a silent 429.
const HARD_LIMIT_USER_TURNS = 56;
const SOFT_LIMIT_USER_TURNS = 50;

export function ClaraChat(props: ClaraChatProps) {
	const chat = useClaraChat({
		intakeId: props.intakeId,
		resumeToken: props.resumeToken,
		initialMessages: props.initialMessages,
	});

	const hydratedExtractedEarly = useMemo(
		() => extractFromIntake(props.answers ?? null, props.contactName ?? "", props.companyName ?? ""),
		[props.answers, props.contactName, props.companyName],
	);
	const mergedExtractedEarly = useMemo(
		() => mergeExtracted(hydratedExtractedEarly, chat.extracted),
		[hydratedExtractedEarly, chat.extracted],
	);

	const lastNotified = useRef(false);
	useEffect(() => {
		if (chat.qualified && !lastNotified.current) {
			lastNotified.current = true;
			props.onQualified?.(chat.qualifiedReason, mergedExtractedEarly);
		}
	}, [chat.qualified, chat.qualifiedReason, mergedExtractedEarly, props]);

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

	const [summaryOpen, setSummaryOpen] = useState(false);
	const mergedExtracted = mergedExtractedEarly;

	return (
		<div className="sofia-page flex min-h-[100dvh] flex-col">
			<TopStrip />
			<MastHead
				summaryAvailable={hasAnyExtracted(mergedExtractedEarly)}
				onOpenSummary={() => setSummaryOpen(true)}
				online={chat.status !== "error"}
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
// Top strip + masthead

function TopStrip() {
	return (
		<div className="border-b border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper)]/70 backdrop-blur-sm">
			<div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-2.5">
				<p className="sofia-display text-[13px] font-medium italic tracking-tight text-[color:var(--color-ink)]">
					Jotaduo
				</p>
				<p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-ink-muted)]">
					atendimento
				</p>
			</div>
		</div>
	);
}

function MastHead({
	summaryAvailable,
	onOpenSummary,
	online,
}: {
	summaryAvailable: boolean;
	onOpenSummary: () => void;
	online: boolean;
}) {
	return (
		<header className="px-6 pt-10 pb-6 sm:pt-14 sm:pb-8">
			<div className="mx-auto max-w-2xl">
				<div className="flex items-end justify-between gap-6">
					<div>
						<h1 className="sofia-display text-[44px] leading-none font-medium italic tracking-tight text-[color:var(--color-ink)] sm:text-[56px]">
							Sofia
						</h1>
						<p className="mt-3 flex items-center gap-2 text-[13px] text-[color:var(--color-ink-soft)]">
							<span
								className={cn(
									"inline-block h-1.5 w-1.5 rounded-full",
									online ? "bg-[color:var(--color-forest)]" : "bg-[color:var(--color-terracotta)]",
								)}
								aria-hidden="true"
							/>
							{online ? "atendendo agora · uma conversa de cada vez" : "perdi conexão um instante"}
						</p>
					</div>
					<button
						type="button"
						onClick={onOpenSummary}
						disabled={!summaryAvailable}
						aria-label={
							summaryAvailable
								? "Ver o que a Sofia entendeu até agora"
								: "Disponível depois que a Sofia entender seu negócio"
						}
						className={cn(
							"group inline-flex shrink-0 items-center gap-2 border-b border-dotted pb-0.5 text-[12px] tracking-wide transition",
							summaryAvailable
								? "border-[color:var(--color-forest)] text-[color:var(--color-forest)] hover:text-[color:var(--color-ink)]"
								: "border-[color:var(--color-paper-edge)] text-[color:var(--color-ink-muted)] cursor-not-allowed",
						)}
					>
						<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
							<path
								d="M5 5h14v3H5zM5 11h10v3H5zM5 17h7v3H5z"
								fill="currentColor"
								opacity="0.8"
							/>
						</svg>
						o que anotei
					</button>
				</div>
				<div
					className="mt-6 h-px w-16"
					style={{
						background: "linear-gradient(to right, var(--color-forest), transparent)",
					}}
				/>
			</div>
		</header>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages

function MessageList({ chat }: { chat: ClaraChatState }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

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

	const lastAssistantLen =
		chat.messages.length > 0
			? chat.messages[chat.messages.length - 1]?.content?.length ?? 0
			: 0;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickToBottom.current) {
			el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
		}
	}, [chat.messages.length, lastAssistantLen, chat.status]);

	const visible = chat.messages.filter(
		(m, idx) => !(idx === 0 && m.role === "user" && m.content === "Oi! Pode começar."),
	);

	return (
		<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
			<ol
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				aria-label="Conversa com a Sofia"
				className="mx-auto flex max-w-2xl list-none flex-col gap-8 px-6 pb-8 sm:gap-10 sm:pb-12"
			>
				{visible.map((m) => (
					<MessageItem key={m.id} message={m} />
				))}
				{chat.status === "sending" && <TypingItem />}
			</ol>
		</div>
	);
}

function MessageItem({ message }: { message: ClaraMessage }) {
	if (message.role === "user") {
		if (!message.content) return null;
		return (
			<li className="sofia-reveal flex justify-end">
				<div className="sofia-note max-w-[78%] px-4 py-3">
					<span className="sr-only">Você:</span>
					<p className="font-body text-[15px] leading-relaxed text-[color:var(--color-ink)] whitespace-pre-wrap">
						{message.content}
					</p>
				</div>
			</li>
		);
	}

	if (message.content) {
		return (
			<li className="sofia-reveal sofia-rule relative pl-5">
				<span className="sr-only">Sofia:</span>
				<p className="sofia-display text-[19px] leading-[1.65] tracking-tight text-[color:var(--color-ink)] whitespace-pre-wrap sm:text-[20px]">
					{message.content}
					{message.streaming && (
						<span className="sofia-cursor ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.18em] bg-[color:var(--color-forest)] align-middle" />
					)}
				</p>
			</li>
		);
	}
	if (message.streaming) {
		return (
			<li className="sofia-reveal sofia-rule relative pl-5">
				<span className="sr-only">Sofia está pensando</span>
				<TypingDots />
			</li>
		);
	}
	if (message.errorText) {
		return (
			<li className="sofia-reveal relative pl-5">
				<span
					className="absolute left-0 top-1 bottom-1 w-[2px] rounded bg-[color:var(--color-terracotta)]"
					aria-hidden="true"
				/>
				<p
					className="sofia-display text-[16px] italic text-[color:var(--color-terracotta)]"
					role="alert"
					aria-atomic="true"
				>
					{message.errorText}
				</p>
			</li>
		);
	}
	return null;
}

function TypingItem() {
	return (
		<li className="sofia-rule relative pl-5">
			<span className="sr-only">Sofia está pensando</span>
			<TypingDots />
		</li>
	);
}

function TypingDots() {
	return (
		<span className="inline-flex items-center gap-1.5" aria-label="Sofia está pensando">
			<span className="pc-typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--color-forest)]" />
			<span
				className="pc-typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--color-forest)]"
				style={{ animationDelay: "0.18s" }}
			/>
			<span
				className="pc-typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--color-forest)]"
				style={{ animationDelay: "0.36s" }}
			/>
		</span>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Limit warning — editorial footnote, not a banner.

function LimitWarning({ chat }: { chat: ClaraChatState }) {
	const userTurns = chat.messages.filter((m) => m.role === "user" && m.content).length;
	if (chat.qualified) return null;
	if (userTurns < SOFT_LIMIT_USER_TURNS) return null;

	const reached = userTurns >= HARD_LIMIT_USER_TURNS;
	const remaining = Math.max(0, HARD_LIMIT_USER_TURNS - userTurns);

	return (
		<aside
			className="border-t border-[color:var(--color-paper-edge)] px-6 py-3"
			role="status"
			aria-live="polite"
		>
			<div className="mx-auto max-w-2xl">
				<p className="sofia-display text-[13px] italic text-[color:var(--color-ink-soft)]">
					{reached ? (
						<>
							<span className="text-[color:var(--color-terracotta)]">Conversamos bastante já.</span>{" "}
							Vou montar o resumo e o seu painel.
						</>
					) : (
						<>
							{`Faltam ${remaining} ${remaining === 1 ? "mensagem" : "mensagens"} pra eu fechar — se preferir, posso já te abrir o painel.`}
						</>
					)}
				</p>
			</div>
		</aside>
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

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setValue(e.target.value);
		const t = e.target;
		t.style.height = "auto";
		t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
	};

	useEffect(() => {
		if (!disabled) textareaRef.current?.focus();
	}, [disabled]);

	const placeholder = qualified ? "Já fechei aqui — siga as instruções acima." : "Escreva uma resposta…";
	const canSend = !disabled && value.trim().length > 0;

	return (
		<div
			className="sticky bottom-0 border-t border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper)]/85 px-4 pt-4 pb-4 backdrop-blur-sm sm:px-6"
			style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
		>
			<div className="mx-auto flex max-w-2xl items-end gap-4">
				<div className="hidden sm:block">
					<PenGlyph />
				</div>
				<div className="relative flex-1">
					<label htmlFor="sofia-message-input" className="sr-only">
						Sua resposta para a Sofia
					</label>
					<textarea
						id="sofia-message-input"
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKey}
						placeholder={placeholder}
						rows={1}
						disabled={disabled}
						aria-multiline="true"
						className={cn(
							"w-full resize-none bg-transparent py-2 text-[16px] leading-relaxed",
							"font-body text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-muted)] placeholder:italic",
							"border-b border-[color:var(--color-paper-edge)]",
							"max-h-40 overflow-y-auto",
							"focus:border-[color:var(--color-forest)] focus:outline-none",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
					/>
				</div>
				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label="Enviar mensagem"
					className={cn(
						"sofia-display shrink-0 rounded-sm px-4 py-2 text-[15px] tracking-tight transition",
						"border",
						canSend
							? "border-[color:var(--color-forest)] bg-[color:var(--color-forest)] text-[color:var(--color-paper)] hover:bg-[color:var(--color-forest-soft)]"
							: "border-[color:var(--color-paper-edge)] bg-transparent text-[color:var(--color-ink-muted)]",
					)}
				>
					<span className="italic">enviar</span>
				</button>
			</div>
			<p className="mx-auto mt-2 max-w-2xl text-center text-[11px] tracking-wide text-[color:var(--color-ink-muted)]">
				enter envia · shift+enter quebra linha
			</p>
		</div>
	);
}

function PenGlyph() {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			aria-hidden="true"
			className="sofia-pen-tip text-[color:var(--color-ink-soft)]"
		>
			<path
				d="M14.7 4.3l5 5L8.5 20.5 3 21l.5-5.5L14.7 4.3z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
			<path
				d="M13.5 5.5l5 5"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Provision banner — three states (provisioning / provisioned / error).

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
			<aside
				className="border-t border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-deep)]/60 px-6 py-4"
				role="status"
				aria-live="polite"
			>
				<div className="mx-auto flex max-w-2xl items-center gap-3">
					<TypingDots />
					<p className="sofia-display text-[15px] italic text-[color:var(--color-forest)]">
						Preparando seu painel agora.
					</p>
				</div>
			</aside>
		);
	}

	if (status === "error") {
		return (
			<aside
				className="border-t border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-deep)]/60 px-6 py-4"
				role="status"
				aria-live="polite"
			>
				<div className="mx-auto max-w-2xl">
					<p className="sofia-display text-[15px] italic text-[color:var(--color-terracotta)]">
						Tropecei aqui — {error || "problema técnico"}.
					</p>
					<p className="mt-1 text-[13px] text-[color:var(--color-ink-soft)]">
						A equipe já recebeu o aviso e vai te chamar.
					</p>
				</div>
			</aside>
		);
	}

	if (!provisioned) return null;

	if (provisioned.alreadyExists) {
		return (
			<ProvisionSuccessCard
				title="Você já tem painel ativo"
				subtitle={`Está em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine="Use o link que você já recebeu no email para entrar."
			/>
		);
	}

	if (provisioned.loginMode === "magic_link") {
		return (
			<ProvisionSuccessCard
				title="Seu painel está pronto"
				subtitle={`Está em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine={
					provisioned.checkEmail
						? "Acabei de te mandar um link de acesso no seu email. Clica nele pra entrar."
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

	return (
		<ProvisionSuccessCard
			title="Seu painel está pronto"
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
		<aside className="border-t border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-deep)]/70 px-6 py-5">
			<div className="mx-auto max-w-2xl">
				<div className="flex items-start gap-4">
					<SealGlyph />
					<div className="flex-1">
						<p className="sofia-display text-[20px] italic text-[color:var(--color-forest)]">
							{title}
						</p>
						<p className="mt-0.5 text-[13px] text-[color:var(--color-ink-soft)]">{subtitle}</p>
						{secondaryLine && (
							<p className="mt-2 text-[13px] text-[color:var(--color-ink-soft)]">
								{secondaryLine}
							</p>
						)}

						{password && (
							<dl className="mt-4 space-y-2 text-[13px]">
								<div className="flex items-center gap-2">
									<dt className="w-16 shrink-0 text-[color:var(--color-ink-muted)]">Email</dt>
									<dd className="flex flex-1 items-center gap-2">
										<code className="rounded-sm border border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper)] px-2 py-0.5 font-mono text-[12px] text-[color:var(--color-ink)]">
											{email}
										</code>
										<button
											type="button"
											onClick={() => copy(email, "email")}
											className="text-[11px] uppercase tracking-wide text-[color:var(--color-forest)] hover:text-[color:var(--color-ink)]"
											aria-label="Copiar email"
										>
											{copied === "email" ? "copiado" : "copiar"}
										</button>
									</dd>
								</div>
								<div className="flex items-center gap-2">
									<dt className="w-16 shrink-0 text-[color:var(--color-ink-muted)]">Senha</dt>
									<dd className="flex flex-1 items-center gap-2">
										<code className="rounded-sm border border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper)] px-2 py-0.5 font-mono text-[12px] text-[color:var(--color-ink)]">
											{password}
										</code>
										<button
											type="button"
											onClick={() => copy(password, "password")}
											className="text-[11px] uppercase tracking-wide text-[color:var(--color-forest)] hover:text-[color:var(--color-ink)]"
											aria-label="Copiar senha"
										>
											{copied === "password" ? "copiado" : "copiar"}
										</button>
									</dd>
								</div>
								<button
									type="button"
									onClick={() => copy(`${email}\n${password}`, "all")}
									className="mt-1 inline-block border-b border-dotted border-[color:var(--color-forest)] text-[11px] uppercase tracking-wide text-[color:var(--color-forest)] hover:text-[color:var(--color-ink)]"
								>
									copiar email + senha
								</button>
							</dl>
						)}

						<div className="mt-4 flex flex-wrap items-center gap-3">
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								className="sofia-display inline-flex items-center gap-2 rounded-sm border border-[color:var(--color-forest)] bg-[color:var(--color-forest)] px-4 py-2 text-[14px] italic tracking-tight text-[color:var(--color-paper)] hover:bg-[color:var(--color-forest-soft)]"
							>
								Entrar no meu painel ↗
							</a>
							{resend && (
								<button
									type="button"
									onClick={() => void doResend()}
									disabled={resendState === "sending" || resendState === "sent"}
									className="text-[12px] tracking-wide text-[color:var(--color-forest)] underline-offset-4 hover:underline disabled:opacity-50"
								>
									{resendState === "sent"
										? "link reenviado"
										: resendState === "sending"
											? "enviando…"
											: resendState === "error"
												? "tentar de novo"
												: "reenviar link"}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
}

function SealGlyph() {
	return (
		<svg
			width="40"
			height="40"
			viewBox="0 0 40 40"
			aria-hidden="true"
			className="shrink-0"
		>
			<circle
				cx="20"
				cy="20"
				r="17"
				fill="none"
				stroke="var(--color-forest)"
				strokeWidth="1.4"
				strokeDasharray="2 3"
			/>
			<text
				x="50%"
				y="55%"
				textAnchor="middle"
				dominantBaseline="middle"
				fontFamily="Fraunces, serif"
				fontStyle="italic"
				fontWeight="500"
				fontSize="17"
				fill="var(--color-forest)"
			>
				S
			</text>
		</svg>
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
		<aside
			className="border-t border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-deep)]/60 px-6 py-3"
			role="alert"
			aria-atomic="true"
		>
			<div className="mx-auto max-w-2xl">
				<p className="sofia-display text-[14px] italic text-[color:var(--color-terracotta)]">
					{error}
				</p>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="mt-1 text-[12px] tracking-wide text-[color:var(--color-terracotta)] underline-offset-4 hover:underline"
					>
						tentar de novo
					</button>
				)}
			</div>
		</aside>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary side panel

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
				className="flex-1 bg-[color:var(--color-ink)]/30 backdrop-blur-[2px]"
				aria-label="Fechar painel"
				onClick={onClose}
			/>
			<aside className="sofia-page flex w-full max-w-sm flex-col border-l border-[color:var(--color-paper-edge)] shadow-2xl sm:max-w-md">
				<div className="flex items-center justify-between border-b border-[color:var(--color-paper-edge)] px-6 py-4">
					<div>
						<p className="sofia-display text-[18px] italic text-[color:var(--color-ink)]">
							o que anotei
						</p>
						<p className="text-[12px] text-[color:var(--color-ink-muted)]">
							preencho enquanto conversamos
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm px-2 py-1 text-[12px] uppercase tracking-wide text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
						aria-label="Fechar"
					>
						fechar
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-6 py-5">
					{empty ? (
						<p className="sofia-display text-[15px] italic text-[color:var(--color-ink-muted)]">
							ainda nada anotado — conversa comigo um pouco que eu já organizo.
						</p>
					) : (
						<dl className="space-y-5">
							<SummarySection
								label="quem"
								items={[extracted.contactName, extracted.companyName].filter(Boolean) as string[]}
							/>
							<SummarySection label="negócio" items={extracted.segments} />
							<SummarySection label="como vende" items={salesChips} />
							<SummarySection label="canais" items={extracted.channels} />
							<SummarySection
								label="foco do problema"
								items={extracted.problemArea ? [PROBLEM_AREA_LABELS[extracted.problemArea]] : []}
							/>
							<SummarySection label="dores" items={extracted.pains} />
							<SummarySection label="sistemas" items={extracted.systems} />
						</dl>
					)}
				</div>
			</aside>
		</div>
	);
}

function SummarySection({ label, items }: { label: string; items: string[] }) {
	if (items.length === 0) return null;
	return (
		<div>
			<dt className="mb-1.5 text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--color-ink-muted)]">
				{label}
			</dt>
			<dd className="flex flex-wrap gap-1.5">
				{items.map((it) => (
					<span
						key={it}
						className="inline-flex items-center rounded-sm border border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-deep)] px-2 py-0.5 text-[13px] text-[color:var(--color-ink)]"
					>
						{it}
					</span>
				))}
			</dd>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers

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
